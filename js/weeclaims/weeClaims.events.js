/** Capa de presentación: listeners, render y feedback. */
import {
  HttpClient,
  WeeClaimsService,
  API_CONFIG
} from './weeClaims.service.js'
import { WeeClaimsHandler, DOC_STATUS, STEPS } from './weeClaims.handler.js'

const SELECTORS = Object.freeze({
  steps: '[data-step]',
  form: '#formPreTramite',
  list: '#listaDocumentos',
  continue: '#btnContinuar',
  folio: '#folioResultado',
  alert: '#alerta'
})
const STATUS_LABEL = Object.freeze({
  [DOC_STATUS.PENDIENTE]: 'Pendiente',
  [DOC_STATUS.CARGANDO]: 'Subiendo…',
  [DOC_STATUS.CARGADO]: 'Cargado ✓',
  [DOC_STATUS.ERROR]: 'Error, reintenta'
})

export class WeeClaimsEvents {
  /** @param {WeeClaimsHandler} handler */
  constructor (handler) {
    this.handler = handler
    this.$ = selector => document.querySelector(selector)
  }
  /** Inicializa listeners y estado inicial. */
  init () {
    this.$(SELECTORS.form).addEventListener('submit', event =>
      this.onSubmit(event)
    )
    this.$(SELECTORS.continue).addEventListener('click', () =>
      this.onContinue()
    )
    this.showStep(STEPS.PRE_TRAMITE)
  }
  /** Atiende el registro y la consulta de documentos. */
  async onSubmit (event) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    data.Num_Dependiente = Number(data.Num_Dependiente || 0)
    await this.withLoading(
      event.currentTarget.querySelector('button[type="submit"]'),
      async () => {
        if (this.handler.state.currentStep === STEPS.PRE_TRAMITE)
          await this.handler.registrarPreTramite(data)
        const documentos = await this.handler.obtenerDocumentos()
        this.renderDocuments(documentos)
        this.showStep(STEPS.CARGA)
      }
    )
  }
  /** Renderiza los documentos devueltos por la API sin HTML dinámico. */
  renderDocuments (documents) {
    const list = this.$(SELECTORS.list)
    list.replaceChildren(
      ...documents.map(document => this.createDocumentItem(document))
    )
    this.updateContinueButton()
  }
  createDocumentItem (document) {
    const item = documentElement('article', 'document-item')
    item.dataset.idDocumento = document.idDocumento
    const title = documentElement('div', 'document-title')
    title.textContent = document.nombre
    if (document.obligatorio) {
      const mark = documentElement('span', 'required-mark')
      mark.textContent = ' *'
      title.append(mark)
    }
    const input = documentElement('input', 'document-input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.xml'
    input.addEventListener('change', event =>
      this.onFileSelected(document.idDocumento, event.currentTarget)
    )
    const status = documentElement('span', 'document-status')
    status.textContent = STATUS_LABEL[document.status]
    item.append(title, input, status)
    return item
  }
  /** Sube un solo documento y permite reintento individual. */
  async onFileSelected (idDocumento, input) {
    const file = input.files?.[0]
    if (!file) return
    this.updateStatus(idDocumento, DOC_STATUS.CARGANDO)
    input.disabled = true
    try {
      await this.handler.cargarDocumento(idDocumento, file)
      this.updateStatus(idDocumento, DOC_STATUS.CARGADO)
    } catch (error) {
      this.updateStatus(idDocumento, DOC_STATUS.ERROR)
      this.showError(error)
      input.value = ''
    } finally {
      input.disabled = false
      this.updateContinueButton()
    }
  }
  /** Solicita y muestra el folio final. */
  async onContinue () {
    await this.withLoading(this.$(SELECTORS.continue), async () => {
      const folio = await this.handler.obtenerFolio()
      this.$(SELECTORS.folio).textContent = folio
      this.showStep(STEPS.FOLIO)
    })
  }
  updateStatus (idDocumento, status) {
    const statusElement = this.$(
      `[data-id-documento="${CSS.escape(idDocumento)}"] .document-status`
    )
    if (statusElement) {
      statusElement.textContent = STATUS_LABEL[status]
      statusElement.className = `document-status is-${status}`
    }
  }
  updateContinueButton () {
    this.$(SELECTORS.continue).disabled = !this.handler.puedeContinuar()
  }
  showStep (step) {
    document.querySelectorAll(SELECTORS.steps).forEach(element => {
      element.hidden = Number(element.dataset.step) !== step
    })
    document.querySelectorAll('[data-progress]').forEach(element => {
      const progress = Number(element.dataset.progress)
      element.classList.toggle('is-active', progress === step)
      element.classList.toggle('is-complete', progress < step)
    })
  }
  showError (error) {
    const alert = this.$(SELECTORS.alert)
    alert.textContent = error?.message || 'Ocurrió un error inesperado.'
    alert.hidden = false
  }
  async withLoading (button, action) {
    this.$(SELECTORS.alert).hidden = true
    button.disabled = true
    try {
      await action()
    } catch (error) {
      this.showError(error)
    } finally {
      button.disabled = false
    }
  }
}

function documentElement (tag, className) {
  const element = document.createElement(tag)
  element.className = className
  return element
}

document.addEventListener('DOMContentLoaded', () => {
  const service = new WeeClaimsService(new HttpClient(API_CONFIG.BASE_URL))
  const handler = new WeeClaimsHandler(service)
  new WeeClaimsEvents(handler).init()
})

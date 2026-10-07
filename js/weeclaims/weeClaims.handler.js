/** Lógica de negocio, estado y orquestación de Steps. */
export const STEPS = Object.freeze({
  PRE_TRAMITE: 1,
  DOCUMENTOS: 2,
  CARGA: 3,
  FOLIO: 4
})
export const DOC_STATUS = Object.freeze({
  PENDIENTE: 'pendiente',
  CARGANDO: 'cargando',
  CARGADO: 'cargado',
  ERROR: 'error'
})
const FILE_RULES = Object.freeze({
  MAX_SIZE_MB: 10,
  EXTENSIONS: ['pdf', 'jpg', 'jpeg', 'png', 'xml']
})
const ResponseMapper = {
  toIdTramite: res =>
    res?.dsRespuesta?.Datos?.[0]?.idTramite ??
    res?.GenericResponse?.idTramite ??
    res?.ID ??
    res?.dsRespuesta?.ID,
  toDocumentos: res =>
    (res?.dsRespuesta?.Datos ?? []).map(documento => ({
      idDocumento: documento.idDocumento,
      nombre: documento.NombreDocumento,
      plantilla: documento.Plantilla,
      obligatorio: Number(documento.Obligatorio) === 1,
      status: DOC_STATUS.PENDIENTE,
      idArchivo: null
    })),
  toIdArchivo: res =>
    res?.dsRespuesta?.Archivos?.[0]?.idArchivo ??
    res?.GenericResponse?.idArchivo ??
    res?.ID ??
    res?.dsRespuesta?.ID,
  toFolio: res =>
    res?.dsRespuesta?.Datos?.[0]?.Folio ??
    res?.GenericResponse ??
    res?.Folio ??
    res?.Mensaje
}

export class WeeClaimsHandler {
  /** @param {import('./weeClaims.service.js').WeeClaimsService} service */
  constructor (service) {
    this.service = service
    this.state = {
      currentStep: STEPS.PRE_TRAMITE,
      idTramite: null,
      documentos: [],
      folio: null
    }
  }
  /** Ejecuta el Step 1 y guarda el identificador del trámite. */
  async registrarPreTramite (formData) {
    this.#validarPreTramite(formData)
    const response = await this.service.addPreTramite(formData)
    const idTramite = ResponseMapper.toIdTramite(response)
    if (!idTramite)
      throw new Error('No se recibió el identificador del trámite.')
    this.state.idTramite = idTramite
    this.state.currentStep = STEPS.DOCUMENTOS
    return idTramite
  }
  /** Ejecuta el Step 2 y devuelve documentos dinámicos. */
  async obtenerDocumentos () {
    this.#assertStep(STEPS.DOCUMENTOS)
    const response = await this.service.getDocumentosByTramiteVentanilla(
      this.state.idTramite
    )
    this.state.documentos = ResponseMapper.toDocumentos(response)
    this.state.currentStep = STEPS.CARGA
    return this.state.documentos
  }
  /** Ejecuta 3.a y 3.b para un documento, en orden. */
  async cargarDocumento (idDocumento, file) {
    this.#assertStep(STEPS.CARGA)
    const documento = this.#findDocumento(idDocumento)
    this.#validarArchivo(file)
    documento.status = DOC_STATUS.CARGANDO
    try {
      const uploadResponse = await this.service.uploadFileAzure(file)
      const idArchivo = ResponseMapper.toIdArchivo(uploadResponse)
      if (!idArchivo)
        throw new Error('No se recibió el identificador del archivo.')
      await this.service.updateDocumentosTramiteVentanilla({
        idArchivo,
        idTramite: this.state.idTramite,
        idDocumento
      })
      documento.idArchivo = idArchivo
      documento.status = DOC_STATUS.CARGADO
      return documento
    } catch (error) {
      documento.status = DOC_STATUS.ERROR
      throw error
    }
  }
  /** Indica si los documentos obligatorios ya están cargados. */
  puedeContinuar () {
    return this.state.documentos
      .filter(documento => documento.obligatorio)
      .every(documento => documento.status === DOC_STATUS.CARGADO)
  }
  /** Ejecuta el Step 4 y devuelve el folio. */
  async obtenerFolio () {
    this.#assertStep(STEPS.CARGA)
    if (!this.puedeContinuar())
      throw new Error('Faltan documentos obligatorios por cargar.')
    const response = await this.service.getFolioByTramite(this.state.idTramite)
    this.state.folio = ResponseMapper.toFolio(response)
    if (!this.state.folio)
      throw new Error('No se recibió el folio del trámite.')
    this.state.currentStep = STEPS.FOLIO
    return this.state.folio
  }
  #assertStep (expected) {
    if (this.state.currentStep !== expected)
      throw new Error('Paso no disponible. Completa el paso anterior.')
  }
  #findDocumento (idDocumento) {
    const documento = this.state.documentos.find(
      item => item.idDocumento === idDocumento
    )
    if (!documento) throw new Error('Documento no encontrado.')
    return documento
  }
  #validarPreTramite (data) {
    const required = [
      'Ramo',
      'Nombre',
      'Apaterno',
      'Email',
      'Num_Poliza',
      'Certificado'
    ]
    const missing = required.filter(key => !String(data?.[key] ?? '').trim())
    if (missing.length)
      throw new Error(`Campos requeridos: ${missing.join(', ')}`)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.Email))
      throw new Error('El correo electrónico no es válido.')
  }
  #validarArchivo (file) {
    if (!file) throw new Error('Selecciona un archivo.')
    const extension = file.name.split('.').pop().toLowerCase()
    if (!FILE_RULES.EXTENSIONS.includes(extension))
      throw new Error(
        `Formato no permitido. Usa: ${FILE_RULES.EXTENSIONS.join(', ')}`
      )
    if (file.size > FILE_RULES.MAX_SIZE_MB * 1024 * 1024)
      throw new Error(`El archivo excede ${FILE_RULES.MAX_SIZE_MB} MB.`)
  }
}

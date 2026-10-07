/** Capa HTTP para la API WeeClaims. */
export const API_CONFIG = Object.freeze({
  BASE_URL: 'http://localhost:3001/api/',
  KEY_WEE: '286A8D0191DC975F2E0433CAEE96DFC23692F9B638D8C93FF02982A27D4D74A2',
  UPLOAD_FIELD_NAME: 'FileToUpload'
})

export const ENDPOINTS = Object.freeze({
  ADD_PRE_TRAMITE: 'api/Banorte/AddPreTramite',
  GET_DOCUMENTOS_BY_TRAMITE_VENTANILLA:
    'api/Banorte/GetDocumentosByTramiteVentanilla',
  UPLOAD_FILE_AZURE: 'api/Banorte/UploadFileAzure',
  UPDATE_DOCUMENTOS_TRAMITE_VENTANILLA:
    'api/Banorte/UpdateDocumentosTramiteVentanilla',
  GET_FOLIO_BY_TRAMITE: 'api/Banorte/GetFolioByTramite'
})

export class ApiError extends Error {
  constructor (message, response = null) {
    super(message)
    this.name = 'ApiError'
    this.response = response
  }
}

export class HttpClient {
  constructor (baseUrl) {
    this.baseUrl = baseUrl
  }
  async postJson (endpoint, body) {
    return this.#send(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  }
  async postForm (endpoint, formData) {
    return this.#send(endpoint, { method: 'POST', body: formData })
  }
  async #send (endpoint, options) {
    let response
    try {
    
      response = await fetch(`${this.baseUrl}${endpoint}`, options)
    } catch (error) {
      throw new ApiError(
        'No fue posible conectar con WeeClaims. Verifica que la API esté disponible.'
      )
    }
    if (!response.ok)
      throw new ApiError(
        `Error HTTP ${response.status} en la operación solicitada.`
      )
    const data = await response.json()
    if (data?.IsOk === false)
      throw new ApiError(
        data.Mensaje || 'La operación no pudo completarse.',
        data
      )
    return data
  }
}

export class WeeClaimsService {
  /** @param {HttpClient} httpClient */
  constructor (httpClient) {
    this.http = httpClient
  }
  /** Registra un pre-trámite. */
  addPreTramite (preTramite) {
    return this.http.postJson(ENDPOINTS.ADD_PRE_TRAMITE, {
      ...preTramite,
      IdProceso: API_CONFIG.KEY_WEE
    })
  }
  /** Obtiene los documentos requeridos. */
  getDocumentosByTramiteVentanilla (idTramite) {
    return this.http.postJson(ENDPOINTS.GET_DOCUMENTOS_BY_TRAMITE_VENTANILLA, {
      idTramite
    })
  }
  /** Sube un archivo a Azure. */
  uploadFileAzure (file) {
    if (!file || typeof file.name !== 'string')
      throw new ApiError('No se recibió un archivo válido para cargar.')
    const formData = new FormData()
    formData.append(API_CONFIG.UPLOAD_FIELD_NAME, file,file.name)
    return this.http.postForm(ENDPOINTS.UPLOAD_FILE_AZURE, formData)
  }
  /** Asocia el archivo al documento del trámite. */
  updateDocumentosTramiteVentanilla ({ idArchivo, idTramite, idDocumento }) {
    return this.http.postJson(ENDPOINTS.UPDATE_DOCUMENTOS_TRAMITE_VENTANILLA, {
      idArchivo,
      IdTramite: idTramite,
      idDocumento
    })
  }
  /** Obtiene el folio final. */
  getFolioByTramite (idTramite) {
    return this.http.postJson(ENDPOINTS.GET_FOLIO_BY_TRAMITE, { idTramite })
  }
}

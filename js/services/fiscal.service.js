// C1: Interfaz de facturación electrónica AFIP/ARCA — PREPARACIÓN SIN BACKEND.
// Define el "contrato" Fiscal.requestCAE(sale, cfg) con una IMPLEMENTACIÓN NULA
// (comprobante interno X, sin CAE) lista para reemplazar por un backend real
// (Cloud Functions plan Blaze o proveedor externo) SIN tocar el frontend.
//
// La integración real NO puede vivir en el navegador: requiere certificado
// digital del contribuyente, punto de venta habilitado para webservices y las
// credenciales guardadas del lado servidor. Por eso aquí sólo dejamos la
// interfaz y el estado fiscal por defecto.

// Códigos de comprobante AFIP (para la plantilla A4).
export const CODIGO_AFIP={X:'99',A:'01',B:'06',C:'11'};

// Mapa condición frente al IVA del COMERCIO -> tipo de comprobante sugerido.
// Los tipos reales (A/B/C) dependen de la condición del comercio y del cliente;
// se confirman con el contador antes de la integración real.
export function tipoPorCondicion(condicionIva){
  switch(condicionIva){
    case 'Responsable Inscripto': return 'A'; // A a Resp. Inscripto; B a consumidor final
    case 'Monotributo':           return 'C';
    case 'Exento':                return 'C';
    default:                      return 'X'; // sin definir / interno
  }
}

// Estado "fiscal" por defecto de una venta recién creada: comprobante interno X,
// sin CAE, pendiente de integración. La NUMERACIÓN FISCAL (numero) es SEPARADA
// de la numeración interna de la venta (sale.number): aquí arranca en 0 ("sin
// asignar") y el backend real la completará al aprobar el CAE.
export function fiscalDefault({puntoVenta='0001',tipoComprobante='X'}={}){
  return {tipoComprobante,puntoVenta,numero:0,cae:'',caeVto:'',estado:'no_fiscal',error:''};
}

// Etiquetas legibles de los estados fiscales (para la UI).
export const ESTADO_FISCAL={
  no_fiscal:'Comprobante interno (sin CAE)',
  pendiente:'Pendiente de CAE',
  aprobado:'CAE aprobado',
  rechazado:'Rechazado por AFIP',
  error:'Error de facturación'
};

// Proveedor fiscal CONECTABLE. El por defecto es NULO: no pide CAE y deja el
// comprobante como interno X. Un backend real lo reemplaza con setProvider().
async function nullProvider(sale,cfg){
  return {
    tipoComprobante:'X',
    puntoVenta:(cfg&&cfg.puntoVenta)||'0001',
    numero:0,            // AFIP no numera el comprobante interno X
    cae:'',
    caeVto:'',
    estado:'no_fiscal',  // no se solicitó CAE (sin integración)
    error:''
  };
}
let provider=nullProvider;

export const Fiscal={
  // Reemplazá el proveedor al conectar el backend real:
  //   Fiscal.setProvider(async (sale,cfg)=>({tipoComprobante,puntoVenta,numero,cae,caeVto,estado,error}))
  setProvider(fn){ provider = (typeof fn==='function') ? fn : nullProvider; },
  // true cuando hay un backend real conectado (distinto del proveedor nulo).
  isEnabled(){ return provider!==nullProvider; },
  // Contrato principal. Devuelve SIEMPRE un objeto "fiscal" válido y NUNCA lanza:
  // ante un error del backend devuelve estado 'error' con el detalle, de modo que
  // la venta ya registrada no se pierde.
  async requestCAE(sale,cfg={}){
    try{
      const r=await provider(sale,cfg);
      return {...fiscalDefault(cfg),...r};
    }catch(ex){
      return {...fiscalDefault(cfg),estado:'error',error:(ex&&ex.message)||'Error de facturación'};
    }
  }
};

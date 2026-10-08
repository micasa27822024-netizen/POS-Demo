// Datos de demostración. Separados de datos reales mediante flag `demo:true`.
import { DB } from '../services/db.service.js';
import { DEMO_MODE } from '../services/firebase.js';
import { demoStore } from '../services/demo-store.js';

const now=Date.now(); const day=864e5;

export const DEMO={
  users:[
    {id:'u_admin',name:'Admin Demo',email:'admin@pos.com',role:'admin',active:true,demoPassword:'admin123',createdAt:now-30*day,lastLogin:now},
    {id:'u_enc',name:'Laura Encargada',email:'encargado@pos.com',role:'encargado',active:true,demoPassword:'enc123',createdAt:now-20*day,lastLogin:now-day},
    {id:'u_caj',name:'Pedro Cajero',email:'cajero@pos.com',role:'cajero',active:true,demoPassword:'caj123',createdAt:now-10*day,lastLogin:now-2*day}
  ],
  categories:[
    {id:'c_alm',name:'Almac\u00e9n',color:'#f59e0b',demo:true},
    {id:'c_beb',name:'Bebidas',color:'#2563eb',demo:true},
    {id:'c_lac',name:'L\u00e1cteos',color:'#0891b2',demo:true},
    {id:'c_lim',name:'Limpieza',color:'#16a34a',demo:true}
  ],
  subcategories:[
    {id:'s_1',name:'Fiambres',categoryId:'c_lac',demo:true},
    {id:'s_2',name:'Gaseosas',categoryId:'c_beb',demo:true},
    {id:'s_3',name:'Detergentes',categoryId:'c_lim',demo:true}
  ],
  suppliers:[
    {id:'sup_1',legalName:'Distribuidora Norte SA',tradeName:'DistriNorte',cuit:'30-12345678-9',phone:'3794-111222',email:'ventas@distrinorte.com',address:'Av. Siempre 123',city:'Corrientes',province:'Corrientes',active:true,demo:true},
    {id:'sup_2',legalName:'Lacteos del Litoral SRL',tradeName:'LitoralLac',cuit:'30-98765432-1',phone:'3794-333444',email:'pedidos@litorallac.com',address:'Ruta 12 Km 5',city:'Resistencia',province:'Chaco',active:true,demo:true}
  ],
  clients:[
    {id:'cl_1',name:'Juan',lastName:'P\u00e9rez',dni:'30111222',phone:'3794-555666',email:'juan@mail.com',city:'Corrientes',province:'Corrientes',creditLimit:50000,balance:12500,active:true,createdAt:now-15*day,demo:true},
    {id:'cl_2',name:'Mar\u00eda',lastName:'G\u00f3mez',dni:'28999888',phone:'3794-777888',email:'maria@mail.com',city:'Resistencia',province:'Chaco',creditLimit:30000,balance:0,active:true,createdAt:now-8*day,demo:true},
    {id:'cl_3',name:'Consumidor',lastName:'Final',dni:'',phone:'',email:'',creditLimit:0,balance:0,active:true,createdAt:now-40*day,demo:true}
  ],
  products:[
    {id:'p_1',code:'A001',barcode:'7790001000011',name:'Coca Cola 2.25L',description:'Gaseosa cola',categoryId:'c_beb',subcategoryId:'s_2',brand:'Coca-Cola',unit:'unidad',cost:1200,price:1850,iva:21,stock:48,stockMin:12,stockMax:120,supplierId:'sup_1',image:'',active:true,createdAt:now-25*day,demo:true},
    {id:'p_2',code:'A002',barcode:'7790001000028',name:'Agua Mineral 2L',description:'Agua sin gas',categoryId:'c_beb',subcategoryId:'s_2',brand:'Villavicencio',unit:'unidad',cost:600,price:950,iva:21,stock:7,stockMin:10,stockMax:80,supplierId:'sup_1',image:'',active:true,createdAt:now-25*day,demo:true},
    {id:'p_3',code:'A003',barcode:'7790002000035',name:'Leche Entera 1L',description:'Leche larga vida',categoryId:'c_lac',subcategoryId:'',brand:'La Serenisima',unit:'unidad',cost:800,price:1250,iva:21,stock:0,stockMin:15,stockMax:100,supplierId:'sup_2',image:'',active:true,createdAt:now-25*day,demo:true},
    {id:'p_4',code:'A004',barcode:'7790003000042',name:'Queso Cremoso',description:'Venta por kilo',categoryId:'c_lac',subcategoryId:'s_1',brand:'Punta del Agua',unit:'kg',cost:5200,price:8500,iva:21,stock:14.5,stockMin:5,stockMax:40,supplierId:'sup_2',image:'',active:true,createdAt:now-25*day,demo:true},
    {id:'p_5',code:'A005',barcode:'7790004000059',name:'Detergente 750ml',description:'Lavavajillas',categoryId:'c_lim',subcategoryId:'s_3',brand:'Magistral',unit:'unidad',cost:900,price:1550,iva:21,stock:33,stockMin:8,stockMax:60,supplierId:'sup_1',image:'',active:true,createdAt:now-25*day,demo:true},
    {id:'p_6',code:'A006',barcode:'7790005000066',name:'Arroz 1kg',description:'Arroz largo fino',categoryId:'c_alm',subcategoryId:'',brand:'Gallo',unit:'unidad',cost:950,price:1480,iva:21,stock:62,stockMin:20,stockMax:150,supplierId:'sup_1',image:'',active:true,createdAt:now-25*day,demo:true},
    {id:'p_7',code:'A007',barcode:'7790006000073',name:'Fideos 500g',description:'Tallarines',categoryId:'c_alm',subcategoryId:'',brand:'Matarazzo',unit:'unidad',cost:620,price:980,iva:21,stock:5,stockMin:15,stockMax:120,supplierId:'sup_1',image:'',active:true,createdAt:now-25*day,demo:true}
  ]
};

function genSales(){
  const sales=[]; const pm=['efectivo','debito','credito','transferencia','cuenta_corriente'];
  const prods=DEMO.products;
  for(let i=0;i<24;i++){
    const dayOffset=Math.floor(Math.random()*30);
    const at=now-dayOffset*day-Math.floor(Math.random()*8)*36e5;
    const nItems=1+Math.floor(Math.random()*3); const items=[]; let subtotal=0, cost=0;
    for(let j=0;j<nItems;j++){ const p=prods[Math.floor(Math.random()*prods.length)];
      const qty=p.unit==='kg'?+(0.25+Math.random()*1.5).toFixed(3):1+Math.floor(Math.random()*4);
      const line=+(p.price*qty).toFixed(2); subtotal+=line; cost+=p.cost*qty;
      items.push({productId:p.id,name:p.name,unit:p.unit,qty,price:p.price,cost:p.cost,discount:0,total:line}); }
    const method=pm[Math.floor(Math.random()*pm.length)];
    const total=+subtotal.toFixed(2);
    sales.push({id:'sale_'+i,number:1000+i,items,subtotal:+subtotal.toFixed(2),discount:0,total,
      cost:+cost.toFixed(2),profit:+(total-cost).toFixed(2),
      payments:[{method,amount:total}],clientId:'cl_'+(1+Math.floor(Math.random()*3)),
      userId:'u_caj',userName:'Pedro Cajero',status:'completada',at,demo:true});
  }
  return sales;
}

export async function loadDemoData(){
  const data={users:DEMO.users,categories:DEMO.categories,subcategories:DEMO.subcategories,
    suppliers:DEMO.suppliers,clients:DEMO.clients,products:DEMO.products,sales:genSales(),
    settings:[{id:'business',name:'Mi Comercio POS',legalName:'Mi Comercio SRL',cuit:'30-11112222-3',
      address:'Calle Principal 100',phone:'3794-000000',email:'contacto@micomercio.com',
      currency:'ARS',iva:21,demo:true}]};
  if(DEMO_MODE){ demoStore.seed(data); return; }
  // En producción: insertar documentos (solo si está permitido por reglas).
  for(const col in data){ for(const doc of data[col]){ const {id,...rest}=doc; await DB.set(col,id,rest); } }
}

export async function ensureSeed(){
  if(DEMO_MODE && !demoStore.has('users')){ await loadDemoData(); }
}

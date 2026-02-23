from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'billennium-secret-key-2024-ecuador')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Billennium System API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# ============== MODELS ==============

class UserBase(BaseModel):
    email: EmailStr
    name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str = "user"
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    role: str
    is_active: bool

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    description: str
    icon: str
    features: List[str]
    plans: List[dict]

class SubscriptionCreate(BaseModel):
    product_id: str
    plan_name: str
    billing_cycle: str = "monthly"

class Subscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    user_name: str
    company_name: Optional[str] = None
    product_id: str
    product_name: str
    plan_name: str
    billing_cycle: str
    is_enabled: bool = False
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    enabled_at: Optional[datetime] = None
    enabled_by: Optional[str] = None

class SubscriptionUpdate(BaseModel):
    is_enabled: bool
    status: Optional[str] = None

class ContactMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    message: str
    product_interest: Optional[str] = None
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ContactMessageCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    message: str
    product_interest: Optional[str] = None

class Company(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    ruc: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    owner_id: str
    enabled_products: List[str] = []
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanyCreate(BaseModel):
    name: str
    ruc: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    ruc: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    enabled_products: Optional[List[str]] = None
    is_active: Optional[bool] = None

# ============== PRODUCTS DATA ==============

PRODUCTS = [
    {
        "id": "restoflow",
        "name": "RestoFlow",
        "slug": "restoflow",
        "description": "Software SaaS para gestión integral de restaurantes con facturación electrónica SRI",
        "icon": "UtensilsCrossed",
        "features": [
            "Gestión de mesas en tiempo real",
            "Comandas a cocina automáticas",
            "Facturación electrónica SRI",
            "Control de inventario",
            "Cierre de caja por turnos",
            "División de cuentas"
        ],
        "plans": [
            {
                "name": "Emprendedor",
                "price_before": 40,
                "price_now": 20,
                "billing": "mensual",
                "features": ["1 local", "1 usuario administrador", "3 usuarios meseros", "Facturación electrónica básica", "Reportes estándar", "Soporte básico"]
            },
            {
                "name": "Empresarial",
                "price_before": 80,
                "price_now": 50,
                "billing": "mensual",
                "popular": True,
                "features": ["1 local", "Usuarios ilimitados", "Inventario con Kardex", "Control de cajas", "Facturación electrónica completa", "Dividir cuenta de clientes", "Soporte prioritario"]
            },
            {
                "name": "Corporativo",
                "price_before": 120,
                "price_now": 80,
                "billing": "mensual",
                "features": ["Multiempresa", "Multi local", "Usuarios ilimitados", "Inventario con Kardex", "Control de cajas", "Facturación electrónica", "Acompañamiento en implementación", "Dividir cuenta de clientes", "Recetas y costo por plato"]
            }
        ]
    },
    {
        "id": "sentinel",
        "name": "Pedidos Sentinel",
        "slug": "pedidos-sentinel",
        "description": "Aplicación de toma de pedidos enlazada a ERP Billennium para equipos de ventas",
        "icon": "Smartphone",
        "features": [
            "Multi-empresa",
            "Sincronización con ERP",
            "Trabajo offline/online",
            "Generación de proformas PDF",
            "Dashboard de ventas",
            "Control de cartera"
        ],
        "plans": [
            {
                "name": "Básico",
                "price_before": 60,
                "price_now": 30,
                "billing": "mensual",
                "features": ["1 vendedor", "1 empresa", "Pedidos y proformas", "Catálogo actualizado diario", "Envío por email/WhatsApp", "Trabajo offline/online", "Sincronización automática con ERP", "Soporte básico"]
            },
            {
                "name": "Profesional",
                "price_before": 120,
                "price_now": 60,
                "billing": "mensual",
                "popular": True,
                "features": ["Hasta 5 vendedores", "Hasta 3 empresas", "Todo lo del Plan Básico", "Cartera (cobranza en ruta)", "Bancos y formas de pago", "Administración de documentos", "Autorización proforma→pedido", "Soporte profesional", "Reportes en PDF/Excel"]
            },
            {
                "name": "Corporativo",
                "price_before": 250,
                "price_now": 125,
                "billing": "mensual",
                "features": ["Hasta 20 vendedores", "Hasta 10 empresas", "Todo lo del Plan Profesional", "Dashboard avanzado de ventas y costos", "Por vendedor, empresa y periodo", "Configuración avanzada de parámetros", "Soporte prioritario"]
            }
        ]
    },
    {
        "id": "importaciones",
        "name": "Módulo de Importaciones",
        "slug": "modulo-importaciones",
        "description": "Control completo de procesos de importación, costos y órdenes de compra internacionales",
        "icon": "Ship",
        "features": [
            "Control de órdenes de compra",
            "Seguimiento de embarques",
            "Cálculo de costos de importación",
            "Gestión de proveedores internacionales",
            "Reportes de costeo",
            "Integración con ERP"
        ],
        "plans": [
            {
                "name": "Estándar",
                "price_before": 80,
                "price_now": 45,
                "billing": "mensual",
                "features": ["Hasta 50 importaciones/mes", "1 usuario", "Control de órdenes de compra", "Seguimiento de embarques", "Cálculo de costos básico", "Reportes estándar"]
            },
            {
                "name": "Profesional",
                "price_before": 150,
                "price_now": 85,
                "billing": "mensual",
                "popular": True,
                "features": ["Importaciones ilimitadas", "Hasta 5 usuarios", "Todo lo del Plan Estándar", "Gestión de proveedores", "Reportes avanzados de costeo", "Integración con ERP", "Soporte prioritario"]
            }
        ]
    },
    {
        "id": "lopdp",
        "name": "LOPDP",
        "slug": "lopdp",
        "description": "Solución para cumplir la Ley Orgánica de Protección de Datos Personales en Ecuador",
        "icon": "ShieldCheck",
        "features": [
            "Inventario de datos personales",
            "Gestión de consentimientos",
            "Registro de tratamientos",
            "Portal de derechos ARCO",
            "Alertas de cumplimiento",
            "Documentación legal automatizada"
        ],
        "plans": [
            {
                "name": "PYME",
                "price_before": 60,
                "price_now": 35,
                "billing": "mensual",
                "features": ["Hasta 500 registros", "1 usuario administrador", "Inventario de datos", "Gestión de consentimientos básica", "Portal ARCO", "Documentación legal básica"]
            },
            {
                "name": "Empresarial",
                "price_before": 120,
                "price_now": 70,
                "billing": "mensual",
                "popular": True,
                "features": ["Registros ilimitados", "Hasta 5 usuarios", "Todo lo del Plan PYME", "Registro de tratamientos completo", "Alertas de cumplimiento", "Reportes de auditoría", "Soporte prioritario"]
            }
        ]
    },
    {
        "id": "facturacion",
        "name": "Facturación Electrónica",
        "slug": "facturacion-electronica",
        "description": "Sistema en la nube para emitir comprobantes electrónicos cumpliendo normativa SRI",
        "icon": "FileText",
        "features": [
            "Facturas electrónicas",
            "Notas de crédito/débito",
            "Retenciones",
            "Guías de remisión",
            "Liquidaciones de compra",
            "Reportes para declaraciones"
        ],
        "plans": [
            {
                "name": "Básico",
                "price_before": 25,
                "price_now": 15,
                "billing": "mensual",
                "features": ["Hasta 100 documentos/mes", "1 usuario", "Facturas y notas de crédito", "Envío automático al SRI", "Portal de consulta", "Soporte por email"]
            },
            {
                "name": "Profesional",
                "price_before": 50,
                "price_now": 30,
                "billing": "mensual",
                "popular": True,
                "features": ["Hasta 500 documentos/mes", "Hasta 3 usuarios", "Todos los tipos de comprobantes", "Retenciones automáticas", "Reportes para declaraciones", "Soporte prioritario"]
            },
            {
                "name": "Empresarial",
                "price_before": 100,
                "price_now": 60,
                "billing": "mensual",
                "features": ["Documentos ilimitados", "Usuarios ilimitados", "Todo lo del Plan Profesional", "API de integración", "Múltiples puntos de emisión", "Soporte dedicado"]
            }
        ]
    },
    {
        "id": "dashboard",
        "name": "Dashboard Empresarial",
        "slug": "dashboard-empresarial",
        "description": "Dashboard comercial y financiero para empresas enlazado a su propio ERP",
        "icon": "BarChart3",
        "features": [
            "KPIs en tiempo real",
            "Análisis de ventas",
            "Control de cartera",
            "Indicadores financieros",
            "Reportes personalizados",
            "Integración con ERP"
        ],
        "plans": [
            {
                "name": "Estándar",
                "price_before": 45,
                "price_now": 25,
                "billing": "mensual",
                "features": ["Dashboard básico", "KPIs principales", "1 usuario", "Datos del día anterior", "Reportes estándar"]
            },
            {
                "name": "Profesional",
                "price_before": 90,
                "price_now": 50,
                "billing": "mensual",
                "popular": True,
                "features": ["Dashboard avanzado", "Todos los KPIs", "Hasta 5 usuarios", "Datos en tiempo real", "Reportes personalizados", "Alertas configurables", "Integración con ERP"]
            }
        ]
    }
]

# ============== HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado. Se requiere rol de administrador")
    return current_user

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    user = User(
        email=user_data.email,
        name=user_data.name,
        company_name=user_data.company_name,
        phone=user_data.phone
    )
    
    user_dict = user.model_dump()
    user_dict["password_hash"] = hash_password(user_data.password)
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    token = create_token(user.id, user.email, user.role)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            company_name=user.company_name,
            phone=user.phone,
            role=user.role,
            is_active=user.is_active
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Usuario desactivado")
    
    token = create_token(user["id"], user["email"], user.get("role", "user"))
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            company_name=user.get("company_name"),
            phone=user.get("phone"),
            role=user.get("role", "user"),
            is_active=user.get("is_active", True)
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        company_name=current_user.get("company_name"),
        phone=current_user.get("phone"),
        role=current_user.get("role", "user"),
        is_active=current_user.get("is_active", True)
    )

# ============== PRODUCTS ROUTES ==============

@api_router.get("/products", response_model=List[Product])
async def get_products():
    return PRODUCTS

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    for product in PRODUCTS:
        if product["id"] == product_id or product["slug"] == product_id:
            return product
    raise HTTPException(status_code=404, detail="Producto no encontrado")

# ============== SUBSCRIPTIONS ROUTES ==============

@api_router.post("/subscriptions", response_model=Subscription)
async def create_subscription(sub_data: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    # Find product
    product = None
    for p in PRODUCTS:
        if p["id"] == sub_data.product_id:
            product = p
            break
    
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # Check if already subscribed
    existing = await db.subscriptions.find_one({
        "user_id": current_user["id"],
        "product_id": sub_data.product_id,
        "status": {"$ne": "cancelled"}
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes una suscripción activa a este producto")
    
    subscription = Subscription(
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_name=current_user["name"],
        company_name=current_user.get("company_name"),
        product_id=sub_data.product_id,
        product_name=product["name"],
        plan_name=sub_data.plan_name,
        billing_cycle=sub_data.billing_cycle
    )
    
    sub_dict = subscription.model_dump()
    sub_dict["created_at"] = sub_dict["created_at"].isoformat()
    if sub_dict.get("enabled_at"):
        sub_dict["enabled_at"] = sub_dict["enabled_at"].isoformat()
    
    await db.subscriptions.insert_one(sub_dict)
    
    return subscription

@api_router.get("/subscriptions/my", response_model=List[Subscription])
async def get_my_subscriptions(current_user: dict = Depends(get_current_user)):
    subs = await db.subscriptions.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(100)
    for sub in subs:
        if isinstance(sub.get("created_at"), str):
            sub["created_at"] = datetime.fromisoformat(sub["created_at"])
        if isinstance(sub.get("enabled_at"), str):
            sub["enabled_at"] = datetime.fromisoformat(sub["enabled_at"])
    return subs

@api_router.get("/admin/subscriptions", response_model=List[Subscription])
async def get_all_subscriptions(admin: dict = Depends(get_admin_user)):
    subs = await db.subscriptions.find({}, {"_id": 0}).to_list(1000)
    for sub in subs:
        if isinstance(sub.get("created_at"), str):
            sub["created_at"] = datetime.fromisoformat(sub["created_at"])
        if isinstance(sub.get("enabled_at"), str):
            sub["enabled_at"] = datetime.fromisoformat(sub["enabled_at"])
    return subs

@api_router.put("/admin/subscriptions/{subscription_id}")
async def update_subscription(subscription_id: str, update_data: SubscriptionUpdate, admin: dict = Depends(get_admin_user)):
    sub = await db.subscriptions.find_one({"id": subscription_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    
    update_fields = {"is_enabled": update_data.is_enabled}
    
    if update_data.is_enabled:
        update_fields["status"] = "active"
        update_fields["enabled_at"] = datetime.now(timezone.utc).isoformat()
        update_fields["enabled_by"] = admin["email"]
    else:
        update_fields["status"] = update_data.status or "suspended"
    
    await db.subscriptions.update_one({"id": subscription_id}, {"$set": update_fields})
    
    return {"message": "Suscripción actualizada correctamente"}

# ============== CONTACT ROUTES ==============

@api_router.post("/contact", response_model=ContactMessage)
async def create_contact_message(message_data: ContactMessageCreate):
    message = ContactMessage(**message_data.model_dump())
    
    msg_dict = message.model_dump()
    msg_dict["created_at"] = msg_dict["created_at"].isoformat()
    
    await db.contact_messages.insert_one(msg_dict)
    
    return message

@api_router.get("/admin/messages", response_model=List[ContactMessage])
async def get_contact_messages(admin: dict = Depends(get_admin_user)):
    messages = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for msg in messages:
        if isinstance(msg.get("created_at"), str):
            msg["created_at"] = datetime.fromisoformat(msg["created_at"])
    return messages

@api_router.put("/admin/messages/{message_id}/read")
async def mark_message_read(message_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.contact_messages.update_one({"id": message_id}, {"$set": {"is_read": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"message": "Mensaje marcado como leído"}

# ============== COMPANIES ROUTES ==============

@api_router.post("/companies", response_model=Company)
async def create_company(company_data: CompanyCreate, current_user: dict = Depends(get_current_user)):
    company = Company(
        **company_data.model_dump(),
        owner_id=current_user["id"]
    )
    
    company_dict = company.model_dump()
    company_dict["created_at"] = company_dict["created_at"].isoformat()
    
    await db.companies.insert_one(company_dict)
    
    return company

@api_router.get("/companies/my", response_model=List[Company])
async def get_my_companies(current_user: dict = Depends(get_current_user)):
    companies = await db.companies.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(100)
    for comp in companies:
        if isinstance(comp.get("created_at"), str):
            comp["created_at"] = datetime.fromisoformat(comp["created_at"])
    return companies

@api_router.get("/admin/companies", response_model=List[Company])
async def get_all_companies(admin: dict = Depends(get_admin_user)):
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    for comp in companies:
        if isinstance(comp.get("created_at"), str):
            comp["created_at"] = datetime.fromisoformat(comp["created_at"])
    return companies

@api_router.put("/admin/companies/{company_id}")
async def update_company(company_id: str, update_data: CompanyUpdate, admin: dict = Depends(get_admin_user)):
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    
    update_fields = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_fields:
        await db.companies.update_one({"id": company_id}, {"$set": update_fields})
    
    return {"message": "Empresa actualizada correctamente"}

# ============== ADMIN USERS ROUTES ==============

@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(admin: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        company_name=u.get("company_name"),
        phone=u.get("phone"),
        role=u.get("role", "user"),
        is_active=u.get("is_active", True)
    ) for u in users]

@api_router.put("/admin/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    new_status = not user.get("is_active", True)
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": new_status}})
    
    return {"message": f"Usuario {'activado' if new_status else 'desactivado'} correctamente"}

# ============== STATS ROUTES ==============

@api_router.get("/admin/stats")
async def get_admin_stats(admin: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    total_subscriptions = await db.subscriptions.count_documents({})
    active_subscriptions = await db.subscriptions.count_documents({"is_enabled": True})
    pending_subscriptions = await db.subscriptions.count_documents({"status": "pending"})
    total_messages = await db.contact_messages.count_documents({})
    unread_messages = await db.contact_messages.count_documents({"is_read": False})
    total_companies = await db.companies.count_documents({})
    
    return {
        "total_users": total_users,
        "total_subscriptions": total_subscriptions,
        "active_subscriptions": active_subscriptions,
        "pending_subscriptions": pending_subscriptions,
        "total_messages": total_messages,
        "unread_messages": unread_messages,
        "total_companies": total_companies
    }

# ============== ROOT ==============

@api_router.get("/")
async def root():
    return {"message": "Billennium System API v1.0", "status": "running"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    # Create admin user if not exists
    admin = await db.users.find_one({"email": "admin@billennium.com"})
    if not admin:
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": "admin@billennium.com",
            "name": "Administrador",
            "password_hash": hash_password("Admin2024!"),
            "role": "admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info("Admin user created")
    
    # Create test user if not exists
    test_user = await db.users.find_one({"email": "kerly@hotmail.com"})
    if not test_user:
        test_user_data = {
            "id": str(uuid.uuid4()),
            "email": "kerly@hotmail.com",
            "name": "Kerly Usuario",
            "password_hash": hash_password("kerly2026"),
            "role": "user",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(test_user_data)
        logger.info("Test user created")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

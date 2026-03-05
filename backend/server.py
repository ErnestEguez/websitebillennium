from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from supabase import create_client, Client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ============== SUPABASE CLIENT ==============
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
    id: str
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
    created_at: datetime
    enabled_at: Optional[datetime] = None
    enabled_by: Optional[str] = None

class SubscriptionUpdate(BaseModel):
    is_enabled: bool
    status: Optional[str] = None

class ContactMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    message: str
    product_interest: Optional[str] = None
    is_read: bool = False
    created_at: datetime

class ContactMessageCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    message: str
    product_interest: Optional[str] = None

class Company(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    ruc: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    owner_id: str
    enabled_products: List[str] = []
    is_active: bool = True
    created_at: datetime

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

class AdminSubscriptionCreate(BaseModel):
    user_id: str
    product_id: str
    plan_name: str

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
                "name": "Básico",
                "price_before": 250,
                "price_now": 150,
                "billing": "mensual",
                "features": [
                    "Dashboard principal con KPIs básicos",
                    "Ventas, compras y cobros del día anterior",
                    "Top 10 clientes y productos",
                    "Hasta 3 usuarios",
                    "Exportación a Excel",
                    "Soporte estándar"
                ]
            },
            {
                "name": "Profesional",
                "price_before": 400,
                "price_now": 250,
                "billing": "mensual",
                "popular": True,
                "features": [
                    "Todo lo del Plan Básico",
                    "Datos en tiempo real",
                    "Dashboard de cartera y vencimientos",
                    "Rentabilidad por producto, vendedor y cliente",
                    "Hasta 10 usuarios",
                    "Alertas configurables por indicador",
                    "Reportes personalizados en PDF/Excel",
                    "Integración total con ERP Billennium",
                    "Soporte prioritario"
                ]
            }
        ]
    },
    {
        "id": "plataforma-ferias",
        "name": "Plataforma Móvil para Ferias",
        "slug": "plataforma-ferias",
        "description": "App móvil instalable + panel web de administración para gestionar ferias y exposiciones de forma profesional.",
        "icon": "Ticket",
        "features": [
            "Registro de visitantes con credencial digital QR",
            "Mapa del recinto con ubicación de stands",
            "Catálogo de expositores con búsqueda por nombre y rubro",
            "Captura de leads mediante escaneo de QR",
            "Clasificación de leads (frío/tibio/caliente)",
            "Exportación de leads a Excel/CSV",
            "Notificaciones generales a visitantes",
            "Cumplimiento LOPDP (consentimiento explícito)"
        ],
        "external_link": "https://proyecto-ferias2026.vercel.app/",
        "plans": []
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

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        result = supabase.table("users").select("*").eq("id", payload["user_id"]).execute()
        if not result.data:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return result.data[0]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado. Se requiere rol de administrador")
    return current_user

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
def register(user_data: UserCreate):
    # Check if email already exists
    existing = supabase.table("users").select("id").eq("email", user_data.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    new_user = {
        "email": user_data.email,
        "name": user_data.name,
        "company_name": user_data.company_name,
        "phone": user_data.phone,
        "password_hash": hash_password(user_data.password),
        "role": "user",
        "is_active": True,
    }

    result = supabase.table("users").insert(new_user).execute()
    user = result.data[0]

    token = create_token(user["id"], user["email"], user["role"])

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            company_name=user.get("company_name"),
            phone=user.get("phone"),
            role=user["role"],
            is_active=user["is_active"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin):
    result = supabase.table("users").select("*").eq("email", credentials.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    user = result.data[0]

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
def get_me(current_user: dict = Depends(get_current_user)):
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
def get_products():
    return PRODUCTS

@api_router.get("/products/{product_id}", response_model=Product)
def get_product(product_id: str):
    for product in PRODUCTS:
        if product["id"] == product_id or product["slug"] == product_id:
            return product
    raise HTTPException(status_code=404, detail="Producto no encontrado")

# ============== SUBSCRIPTIONS ROUTES ==============

@api_router.post("/subscriptions", response_model=Subscription)
def create_subscription(sub_data: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    # Find product
    product = None
    for p in PRODUCTS:
        if p["id"] == sub_data.product_id:
            product = p
            break

    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Check if already subscribed
    existing = supabase.table("subscriptions").select("id").eq(
        "user_id", current_user["id"]
    ).eq("product_id", sub_data.product_id).neq("status", "cancelled").execute()

    if existing.data:
        raise HTTPException(status_code=400, detail="Ya tienes una suscripción activa a este producto")

    new_sub = {
        "user_id": current_user["id"],
        "user_email": current_user["email"],
        "user_name": current_user["name"],
        "company_name": current_user.get("company_name"),
        "product_id": sub_data.product_id,
        "product_name": product["name"],
        "plan_name": sub_data.plan_name,
        "billing_cycle": sub_data.billing_cycle,
        "is_enabled": False,
        "status": "pending",
    }

    result = supabase.table("subscriptions").insert(new_sub).execute()
    sub = result.data[0]
    return _parse_subscription(sub)

@api_router.get("/subscriptions/my", response_model=List[Subscription])
def get_my_subscriptions(current_user: dict = Depends(get_current_user)):
    result = supabase.table("subscriptions").select("*").eq("user_id", current_user["id"]).execute()
    return [_parse_subscription(s) for s in result.data]

@api_router.get("/admin/subscriptions", response_model=List[Subscription])
def get_all_subscriptions(admin: dict = Depends(get_admin_user)):
    result = supabase.table("subscriptions").select("*").order("created_at", desc=True).execute()
    return [_parse_subscription(s) for s in result.data]

@api_router.put("/admin/subscriptions/{subscription_id}")
def update_subscription(subscription_id: str, update_data: SubscriptionUpdate, admin: dict = Depends(get_admin_user)):
    existing = supabase.table("subscriptions").select("id").eq("id", subscription_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")

    update_fields = {"is_enabled": update_data.is_enabled}

    if update_data.is_enabled:
        update_fields["status"] = "active"
        update_fields["enabled_at"] = datetime.now(timezone.utc).isoformat()
        update_fields["enabled_by"] = admin["email"]
    else:
        update_fields["status"] = update_data.status or "suspended"

    supabase.table("subscriptions").update(update_fields).eq("id", subscription_id).execute()
    return {"message": "Suscripción actualizada correctamente"}

@api_router.post("/admin/subscriptions/create")
def admin_create_subscription(sub_data: AdminSubscriptionCreate, admin: dict = Depends(get_admin_user)):
    user_result = supabase.table("users").select("*").eq("id", sub_data.user_id).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user = user_result.data[0]

    product = None
    for p in PRODUCTS:
        if p["id"] == sub_data.product_id:
            product = p
            break

    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    existing = supabase.table("subscriptions").select("id").eq(
        "user_id", sub_data.user_id
    ).eq("product_id", sub_data.product_id).neq("status", "cancelled").execute()

    if existing.data:
        raise HTTPException(status_code=400, detail="El usuario ya tiene este producto asignado")

    new_sub = {
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user["name"],
        "company_name": user.get("company_name"),
        "product_id": sub_data.product_id,
        "product_name": product["name"],
        "plan_name": sub_data.plan_name,
        "billing_cycle": "monthly",
        "is_enabled": True,
        "status": "active",
        "enabled_at": datetime.now(timezone.utc).isoformat(),
        "enabled_by": admin["email"],
    }

    supabase.table("subscriptions").insert(new_sub).execute()
    return {"message": "Producto agregado correctamente"}

# ============== CONTACT ROUTES ==============

@api_router.post("/contact", response_model=ContactMessage)
def create_contact_message(message_data: ContactMessageCreate):
    new_msg = {
        "name": message_data.name,
        "email": message_data.email,
        "phone": message_data.phone,
        "company": message_data.company,
        "message": message_data.message,
        "product_interest": message_data.product_interest,
        "is_read": False,
    }

    result = supabase.table("contact_messages").insert(new_msg).execute()
    msg = result.data[0]
    return _parse_message(msg)

@api_router.get("/admin/messages", response_model=List[ContactMessage])
def get_contact_messages(admin: dict = Depends(get_admin_user)):
    result = supabase.table("contact_messages").select("*").order("created_at", desc=True).execute()
    return [_parse_message(m) for m in result.data]

@api_router.put("/admin/messages/{message_id}/read")
def mark_message_read(message_id: str, admin: dict = Depends(get_admin_user)):
    result = supabase.table("contact_messages").update({"is_read": True}).eq("id", message_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    return {"message": "Mensaje marcado como leído"}

# ============== COMPANIES ROUTES ==============

@api_router.post("/companies", response_model=Company)
def create_company(company_data: CompanyCreate, current_user: dict = Depends(get_current_user)):
    new_company = {
        **company_data.model_dump(),
        "owner_id": current_user["id"],
        "enabled_products": [],
        "is_active": True,
    }

    result = supabase.table("companies").insert(new_company).execute()
    comp = result.data[0]
    return _parse_company(comp)

@api_router.get("/companies/my", response_model=List[Company])
def get_my_companies(current_user: dict = Depends(get_current_user)):
    result = supabase.table("companies").select("*").eq("owner_id", current_user["id"]).execute()
    return [_parse_company(c) for c in result.data]

@api_router.get("/admin/companies", response_model=List[Company])
def get_all_companies(admin: dict = Depends(get_admin_user)):
    result = supabase.table("companies").select("*").execute()
    return [_parse_company(c) for c in result.data]

@api_router.put("/admin/companies/{company_id}")
def update_company(company_id: str, update_data: CompanyUpdate, admin: dict = Depends(get_admin_user)):
    existing = supabase.table("companies").select("id").eq("id", company_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    update_fields = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if update_fields:
        supabase.table("companies").update(update_fields).eq("id", company_id).execute()

    return {"message": "Empresa actualizada correctamente"}

# ============== ADMIN USERS ROUTES ==============

@api_router.get("/admin/users", response_model=List[UserResponse])
def get_all_users(admin: dict = Depends(get_admin_user)):
    result = supabase.table("users").select(
        "id, email, name, company_name, phone, role, is_active"
    ).execute()
    return [UserResponse(**u) for u in result.data]

@api_router.put("/admin/users/{user_id}/toggle-active")
def toggle_user_active(user_id: str, admin: dict = Depends(get_admin_user)):
    existing = supabase.table("users").select("id, is_active").eq("id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    new_status = not existing.data[0]["is_active"]
    supabase.table("users").update({"is_active": new_status}).eq("id", user_id).execute()

    return {"message": f"Usuario {'activado' if new_status else 'desactivado'} correctamente"}

# ============== STATS ROUTES ==============

@api_router.get("/admin/stats")
def get_admin_stats(admin: dict = Depends(get_admin_user)):
    total_users = len(supabase.table("users").select("id", count="exact").execute().data)
    subs_all = supabase.table("subscriptions").select("id, is_enabled, status").execute().data
    msgs_all = supabase.table("contact_messages").select("id, is_read").execute().data
    total_companies = len(supabase.table("companies").select("id", count="exact").execute().data)

    return {
        "total_users": total_users,
        "total_subscriptions": len(subs_all),
        "active_subscriptions": sum(1 for s in subs_all if s["is_enabled"]),
        "pending_subscriptions": sum(1 for s in subs_all if s["status"] == "pending"),
        "total_messages": len(msgs_all),
        "unread_messages": sum(1 for m in msgs_all if not m["is_read"]),
        "total_companies": total_companies,
    }

# ============== ROOT ==============

@api_router.get("/")
def root():
    return {"message": "Billennium System API v1.0", "status": "running", "db": "Supabase"}

# ============== PARSE HELPERS ==============

def _parse_subscription(s: dict) -> Subscription:
    return Subscription(
        id=s["id"],
        user_id=s["user_id"],
        user_email=s["user_email"],
        user_name=s["user_name"],
        company_name=s.get("company_name"),
        product_id=s["product_id"],
        product_name=s["product_name"],
        plan_name=s["plan_name"],
        billing_cycle=s["billing_cycle"],
        is_enabled=s["is_enabled"],
        status=s["status"],
        created_at=datetime.fromisoformat(s["created_at"]) if isinstance(s["created_at"], str) else s["created_at"],
        enabled_at=datetime.fromisoformat(s["enabled_at"]) if s.get("enabled_at") and isinstance(s["enabled_at"], str) else s.get("enabled_at"),
        enabled_by=s.get("enabled_by"),
    )

def _parse_message(m: dict) -> ContactMessage:
    return ContactMessage(
        id=m["id"],
        name=m["name"],
        email=m["email"],
        phone=m.get("phone"),
        company=m.get("company"),
        message=m["message"],
        product_interest=m.get("product_interest"),
        is_read=m["is_read"],
        created_at=datetime.fromisoformat(m["created_at"]) if isinstance(m["created_at"], str) else m["created_at"],
    )

def _parse_company(c: dict) -> Company:
    return Company(
        id=c["id"],
        name=c["name"],
        ruc=c.get("ruc"),
        email=c["email"],
        phone=c.get("phone"),
        address=c.get("address"),
        owner_id=c["owner_id"],
        enabled_products=c.get("enabled_products") or [],
        is_active=c["is_active"],
        created_at=datetime.fromisoformat(c["created_at"]) if isinstance(c["created_at"], str) else c["created_at"],
    )

# ============== APP SETUP ==============

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
def startup_event():
    """Create default admin users if not exists."""
    admins = [
        {"email": "facturacion@billenniumsystem.com", "name": "Administrador Billennium"},
    ]
    try:
        for admin_data in admins:
            existing = supabase.table("users").select("id").eq("email", admin_data["email"]).execute()
            if not existing.data:
                supabase.table("users").insert({
                    "email": admin_data["email"],
                    "name": admin_data["name"],
                    "password_hash": hash_password("Admin2024!"),
                    "role": "admin",
                    "is_active": True,
                }).execute()
                logger.info(f"Admin user created: {admin_data['email']}")
            else:
                logger.info(f"Admin already exists: {admin_data['email']}")
    except Exception as e:
        logger.error(f"Error during startup: {e}")

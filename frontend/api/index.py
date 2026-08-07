from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from supabase import create_client, Client

# Load .env file for local development
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=True)

# ============== EMAIL (vía Edge Function, no SMTP directo) ==============
# Vercel bloquea/restringe conexiones SMTP directas por puerto 587 desde
# funciones Python sin lanzar ningún error visible (smtplib "termina bien"
# pero el correo nunca llega) — confirmado comparando con sri-signer, que
# manda por SMTP2GO desde una Supabase Edge Function (Deno) y sí entrega,
# con las mismas credenciales. En vez de pelear contra esa restricción de
# red, el envío se delega a portal-send-email (Deno), que sí puede abrir
# la conexión SMTP real.
PORTAL_EMAIL_FN_URL = os.environ.get('PORTAL_EMAIL_FN_URL', 'https://ietsocfibsoclienqafq.supabase.co/functions/v1/portal-send-email')
PORTAL_EMAIL_SECRET = os.environ.get('PORTAL_EMAIL_SECRET')
# Mismo patrón que config_sri de QuickInvoice (que sí entrega a Hotmail
# probado): copia siempre al dueño del negocio.
SMTP_CC = os.environ.get('SMTP_CC', 'e_eguez@hotmail.com')

def enviar_correo(destinatario: str, asunto: str, cuerpo: str, cc: str | None = SMTP_CC) -> str | None:
    if not PORTAL_EMAIL_SECRET:
        raise RuntimeError('Envío de correo no configurado (falta PORTAL_EMAIL_SECRET)')
    # Si el destinatario y la copia son el mismo correo, no se manda como
    # cc duplicado (algunos proveedores lo tratan como sospechoso/lo filtran).
    cc_final = cc if (cc and cc.lower() != destinatario.lower()) else None
    import httpx
    resp = httpx.post(
        PORTAL_EMAIL_FN_URL,
        json={"destinatario": destinatario, "asunto": asunto, "cuerpo": cuerpo, "cc": cc_final},
        headers={"x-portal-secret": PORTAL_EMAIL_SECRET},
        timeout=20,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"portal-send-email respondió {resp.status_code}: {resp.text}")
    try:
        return resp.json().get('id')
    except Exception:
        return None

# ============== SUPABASE CLIENT ==============
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dummy.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'dummy-key')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'billennium-secret-key-2024-ecuador')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Billennium System API", redirect_slashes=False)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to specific domains in production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class ChangePasswordRequest(BaseModel):
    new_password: str

# ============== CALCULADORA MODELS ==============

class ModuloCalculadora(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    nombre: str
    precio: float
    orden: int
    activo: bool = True

class ModuloCalculadoraCreate(BaseModel):
    nombre: str
    precio: float
    orden: int = 0

class ModuloCalculadoraUpdate(BaseModel):
    nombre: Optional[str] = None
    precio: Optional[float] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None

class TramoCalculadora(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    parametro: str
    orden: int
    desde: int
    hasta: Optional[int] = None
    recargo: float
    es_contactar: bool = False

class TramoCalculadoraUpdate(BaseModel):
    desde: Optional[int] = None
    hasta: Optional[int] = None
    recargo: Optional[float] = None

class ConfigCalculadora(BaseModel):
    recargo_usuario_pct: float
    dtos_multiempresa: List[float]

class CalculadoraConfigResponse(BaseModel):
    modulos: List[ModuloCalculadora]
    tramos: List[TramoCalculadora]
    recargo_usuario_pct: float
    dtos_multiempresa: List[float]

class EmpresaCotizacionIn(BaseModel):
    nombre: str
    modulos: List[str] = []
    usuarios: int = 1
    clientes: int = 0
    articulos: int = 0
    facturas: int = 0
    compras: int = 0
    empleados: int = 0

class CotizacionCreate(BaseModel):
    cliente_nombre: str
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    observaciones: Optional[str] = None
    empresas: List[EmpresaCotizacionIn]

class Cotizacion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cliente_nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    observaciones: Optional[str] = None
    empresas: List[dict]
    subtotal: float
    total: float
    estado: str
    monto_mensual_acordado: Optional[float] = None
    acordado_por: Optional[str] = None
    acordado_en: Optional[datetime] = None
    created_at: datetime

class CotizacionUpdate(BaseModel):
    estado: Optional[str] = None
    monto_mensual_acordado: Optional[float] = None

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
                "price_now": 30,
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
                "price_now": 35,
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
        "id": "facturacion",
        "name": "ERP QuickInvoice",
        "slug": "facturacion-electronica",
        "description": "ERP completo para PyMEs ecuatorianas: facturación electrónica SRI, inventario, cartera, compras, contabilidad, tesorería, talento humano y cumplimiento LOPDP, todo integrado en un solo sistema.",
        "icon": "FileText",
        "features": [
            "Facturas, N/C, N/D, guías de remisión y liquidaciones de compra electrónicas SRI",
            "Facturación masiva recurrente (clientes con cargo mensual fijo)",
            "Control de inventario con Kardex",
            "Gestión de clientes y cartera CxC",
            "Proveedores, compras (inventario y servicios) y cartera CxP",
            "Retenciones en la fuente e IVA con catálogo SRI actualizado",
            "Contabilidad: plan de cuentas NIIF, asientos automáticos, balances y ATS",
            "Tesorería: cuentas bancarias, cheques, anticipos y conciliación",
            "Talento Humano y Nóminas: roles de pago, décimos, liquidaciones",
            "Cumplimiento LOPDP integrado",
            "Asistentes con IA: OCR de facturas de compra, voz para facturar, análisis de hojas de vida",
            "Dashboard gerencial con indicadores en tiempo real",
            "Multiempresa y múltiples puntos de emisión",
            "Funciona en computador, tablet y celular"
        ],
        "plans": []
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

# ============== ERP MODULES ROUTES ==============

class ERPModuleUpdate(BaseModel):
    vendor: bool
    finance: bool
    ledgerpro: bool
    talento_humano: bool = False
    is_admin: bool = False

@api_router.get("/admin/erp-users")
def list_erp_users(admin: dict = Depends(get_admin_user)):
    """Lista usuarios de Supabase Auth para el selector del formulario."""
    import httpx
    resp = httpx.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?per_page=1000",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=10
    )
    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail="Error consultando usuarios")
    return [{"id": u["id"], "email": u.get("email", "")}
            for u in resp.json().get("users", []) if u.get("email")]

@api_router.get("/admin/erp-empresas")
def list_erp_empresas(admin: dict = Depends(get_admin_user)):
    """Lista empresas de facturacion.empresas para el selector del formulario."""
    import httpx
    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/empresas?select=id,nombre,ruc&order=nombre",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Accept-Profile": "facturacion",
        },
        timeout=10
    )
    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail="Error consultando empresas")
    return resp.json()

@api_router.get("/admin/erp-modules")
def list_erp_modules(admin: dict = Depends(get_admin_user)):
    """Lista registros de user_modules con email y nombre de empresa."""
    import httpx

    facturacion_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "facturacion",
    }

    modules_resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/user_modules?select=user_id,empresa_id,vendor,finance,ledgerpro,talento_humano,is_admin,empresas(nombre,ruc)",
        headers=facturacion_headers, timeout=10
    )
    if modules_resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Error consultando módulos: {modules_resp.text}")
    modules_data = modules_resp.json()

    auth_resp = httpx.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?per_page=1000",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=10
    )
    users_by_id = {}
    if auth_resp.status_code == 200:
        users_by_id = {u["id"]: u.get("email", "") for u in auth_resp.json().get("users", [])}

    result = []
    for m in modules_data:
        empresa = m.get("empresas") or {}
        result.append({
            "user_id":        m["user_id"],
            "empresa_id":     m["empresa_id"],
            "vendor":         m.get("vendor", False),
            "finance":        m.get("finance", False),
            "ledgerpro":      m.get("ledgerpro", False),
            "talento_humano": m.get("talento_humano", False),
            "is_admin":       m.get("is_admin", False),
            "email":          users_by_id.get(m["user_id"], "Desconocido"),
            "empresa_nombre": empresa.get("nombre", m["empresa_id"]),
            "empresa_ruc":    empresa.get("ruc", ""),
        })

    return result

@api_router.put("/admin/erp-modules/{user_id}/{empresa_id}")
def update_erp_modules(user_id: str, empresa_id: str, data: ERPModuleUpdate, admin: dict = Depends(get_admin_user)):
    """Actualiza (upsert) los módulos ERP de un usuario/empresa."""
    import httpx

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "facturacion",
        "Content-Profile": "facturacion",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    resp = httpx.post(
        f"{SUPABASE_URL}/rest/v1/user_modules",
        json={
            "user_id":    user_id,
            "empresa_id": empresa_id,
            "vendor":         data.vendor,
            "finance":        data.finance,
            "ledgerpro":      data.ledgerpro,
            "talento_humano": data.talento_humano,
            "is_admin":       data.is_admin,
        },
        headers=headers, timeout=10
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Error actualizando módulos: {resp.text}")

    return {"ok": True}

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

# ============== CALCULADORA ROUTES ==============
# Precio de la suscripción mensual de QuickInvoice/módulos, calculado a
# partir de tablas editables (calculadora_modulos, calculadora_tramos,
# calculadora_config) en vez del array hardcodeado que tenía el HTML
# standalone. El total que arma esta calculadora es SIEMPRE precio de
# lista — el monto que realmente se cobra cada mes lo fija un admin a
# mano en /admin/cotizaciones/{id} después de negociar (ver Cotizacion).

def _parse_cotizacion(c: dict) -> Cotizacion:
    return Cotizacion(
        id=c["id"],
        cliente_nombre=c["cliente_nombre"],
        telefono=c.get("telefono"),
        email=c.get("email"),
        observaciones=c.get("observaciones"),
        empresas=c["empresas"],
        subtotal=c["subtotal"],
        total=c["total"],
        estado=c["estado"],
        monto_mensual_acordado=c.get("monto_mensual_acordado"),
        acordado_por=c.get("acordado_por"),
        acordado_en=datetime.fromisoformat(c["acordado_en"]) if c.get("acordado_en") and isinstance(c["acordado_en"], str) else c.get("acordado_en"),
        created_at=datetime.fromisoformat(c["created_at"]) if isinstance(c["created_at"], str) else c["created_at"],
    )

def _tramo_recargo(tramos: List[dict], parametro: str, cantidad: int) -> tuple[float, bool]:
    """Recorre los tramos de un parámetro y devuelve (recargo, es_contactar) del tramo donde cae `cantidad`."""
    aplicables = sorted([t for t in tramos if t["parametro"] == parametro], key=lambda t: t["orden"])
    for t in aplicables:
        si_pasa_desde = cantidad >= t["desde"]
        si_pasa_hasta = t["hasta"] is None or cantidad <= t["hasta"]
        if si_pasa_desde and si_pasa_hasta:
            return float(t["recargo"]), bool(t["es_contactar"])
    return 0.0, False

def _calcular_empresa(emp: EmpresaCotizacionIn, modulos: List[dict], tramos: List[dict], recargo_usuario_pct: float) -> dict:
    precios = {m["id"]: float(m["precio"]) for m in modulos}
    base_modulos = sum(precios.get(mid, 0.0) for mid in emp.modulos)
    usuarios = max(1, emp.usuarios)
    con_usuarios = base_modulos * (1 + recargo_usuario_pct * (usuarios - 1))

    recargos_tamano = []
    contacta = False
    for parametro, cantidad in [
        ("clientes", emp.clientes), ("articulos", emp.articulos), ("facturas", emp.facturas),
        ("compras", emp.compras), ("empleados", emp.empleados),
    ]:
        recargo, es_contactar = _tramo_recargo(tramos, parametro, cantidad)
        if es_contactar:
            contacta = True
        recargos_tamano.append({"parametro": parametro, "cantidad": cantidad, "recargo": recargo, "es_contactar": es_contactar})

    total_recargo_tamano = sum(r["recargo"] for r in recargos_tamano)
    subtotal_empresa = con_usuarios + total_recargo_tamano

    return {
        "nombre": emp.nombre, "modulos": emp.modulos, "usuarios": usuarios,
        "base_modulos": base_modulos, "con_usuarios": con_usuarios,
        "recargos_tamano": recargos_tamano, "contacta_ventas": contacta,
        "subtotal": subtotal_empresa,
    }

def _calcular_cotizacion(empresas_in: List[EmpresaCotizacionIn]) -> dict:
    modulos = supabase.table("calculadora_modulos").select("*").eq("activo", True).execute().data or []
    tramos = supabase.table("calculadora_tramos").select("*").execute().data or []
    config_row = supabase.table("calculadora_config").select("*").eq("id", 1).execute().data
    recargo_usuario_pct = float(config_row[0]["recargo_usuario_pct"]) if config_row else 0.20
    dtos_multiempresa = [float(x) for x in config_row[0]["dtos_multiempresa"]] if config_row else [0, 0.15, 0.20, 0.25]

    empresas_calc = []
    subtotal = 0.0
    total = 0.0
    for i, emp in enumerate(empresas_in):
        calc = _calcular_empresa(emp, modulos, tramos, recargo_usuario_pct)
        dto = dtos_multiempresa[min(i, len(dtos_multiempresa) - 1)] if i > 0 else 0.0
        calc["dto_multiempresa_pct"] = dto
        calc["total_empresa"] = calc["subtotal"] * (1 - dto)
        subtotal += calc["subtotal"]
        total += calc["total_empresa"]
        empresas_calc.append(calc)

    return {"empresas": empresas_calc, "subtotal": round(subtotal, 2), "total": round(total, 2)}

@api_router.get("/calculadora/config", response_model=CalculadoraConfigResponse)
def get_calculadora_config():
    modulos = supabase.table("calculadora_modulos").select("*").eq("activo", True).order("orden").execute().data or []
    tramos = supabase.table("calculadora_tramos").select("*").order("parametro").order("orden").execute().data or []
    config_row = supabase.table("calculadora_config").select("*").eq("id", 1).execute().data
    recargo_usuario_pct = float(config_row[0]["recargo_usuario_pct"]) if config_row else 0.20
    dtos_multiempresa = [float(x) for x in config_row[0]["dtos_multiempresa"]] if config_row else [0, 0.15, 0.20, 0.25]
    return CalculadoraConfigResponse(
        modulos=[ModuloCalculadora(**m) for m in modulos],
        tramos=[TramoCalculadora(**t) for t in tramos],
        recargo_usuario_pct=recargo_usuario_pct,
        dtos_multiempresa=dtos_multiempresa,
    )

@api_router.post("/calculadora/cotizacion", response_model=Cotizacion)
def crear_cotizacion(data: CotizacionCreate):
    calculo = _calcular_cotizacion(data.empresas)
    nueva = {
        "cliente_nombre": data.cliente_nombre,
        "telefono": data.telefono,
        "email": data.email,
        "observaciones": data.observaciones,
        "empresas": calculo["empresas"],
        "subtotal": calculo["subtotal"],
        "total": calculo["total"],
        "estado": "nueva",
    }
    result = supabase.table("cotizaciones").insert(nueva).execute()
    return _parse_cotizacion(result.data[0])

@api_router.get("/calculadora/cotizacion/{cotizacion_id}", response_model=Cotizacion)
def obtener_cotizacion(cotizacion_id: str):
    # Público a propósito: es el enlace que se le comparte al cliente para
    # que vea el monto acordado — el id (UUID) ya cumple el rol de token.
    result = supabase.table("cotizaciones").select("*").eq("id", cotizacion_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    return _parse_cotizacion(result.data[0])

CARTA_COTIZACION_PATH = ROOT_DIR / 'templates' / 'carta_cotizacion.txt'

def _cargar_carta_cotizacion(cliente_nombre: str) -> str:
    # Archivo editable a mano (sin tocar código) — ver
    # frontend/api/templates/carta_cotizacion.txt. Único placeholder
    # disponible: {cliente_nombre} (la calculadora solo guarda un campo
    # de nombre, no contacto/empresa por separado).
    try:
        plantilla = CARTA_COTIZACION_PATH.read_text(encoding='utf-8')
        return plantilla.format(cliente_nombre=cliente_nombre)
    except Exception:
        return f"Estimado(a) {cliente_nombre}:\n\nGracias por su interés en Billennium System."

def _construir_mensaje_cotizacion(c: dict) -> str:
    # Los módulos guardados en cada empresa son ids (UUID) de
    # calculadora_modulos, no nombres — hay que resolverlos para que el
    # correo no muestre UUIDs crudos.
    modulos_map = {m['id']: m['nombre'] for m in (supabase.table("calculadora_modulos").select("id, nombre").execute().data or [])}
    linea = '─' * 32
    msg = _cargar_carta_cotizacion(c['cliente_nombre']) + f"\n\n{linea}\n\n"
    for e in c.get('empresas', []):
        nombres = ', '.join(modulos_map.get(m, m) for m in e.get('modulos', [])) or 'Sin módulos'
        msg += f"{e['nombre']}:\n  Módulos: {nombres}\n  Usuarios: {e.get('usuarios', 1)}\n  Subtotal: ${e.get('total_empresa', 0):.2f}"
        if e.get('dto_multiempresa_pct', 0) > 0:
            msg += f" ({e['dto_multiempresa_pct']*100:.0f}% dto.)"
        msg += "\n"
        if e.get('contacta_ventas'):
            msg += "  ⚠ Volumen alto — requiere propuesta a medida\n"
        msg += "\n"
    if c.get('observaciones'):
        msg += f"Observaciones:\n{c['observaciones']}\n\n"
    msg += f"{linea}\nTOTAL MENSUAL ESTIMADO: ${c['total']:.2f}\n(precio de lista, sujeto a confirmación de nuestro equipo)"
    return msg

class EnviarCopiaEmail(BaseModel):
    cotizacion_id: str
    destino: EmailStr

@api_router.post("/calculadora/cotizacion/enviar-email")
def enviar_copia_cotizacion(data: EnviarCopiaEmail):
    result = supabase.table("cotizaciones").select("*").eq("id", data.cotizacion_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    c = result.data[0]
    asunto = f"Cotización QuickInvoice — {c['cliente_nombre']}"
    cuerpo = _construir_mensaje_cotizacion(c)
    try:
        email_id = enviar_correo(data.destino, asunto, cuerpo)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo enviar el correo: {e}")
    return {"message": "Correo enviado", "email_id": email_id}

@api_router.get("/admin/cotizaciones", response_model=List[Cotizacion])
def listar_cotizaciones(admin: dict = Depends(get_admin_user)):
    result = supabase.table("cotizaciones").select("*").order("created_at", desc=True).execute()
    return [_parse_cotizacion(c) for c in result.data]

@api_router.put("/admin/cotizaciones/{cotizacion_id}", response_model=Cotizacion)
def actualizar_cotizacion(cotizacion_id: str, data: CotizacionUpdate, admin: dict = Depends(get_admin_user)):
    existing = supabase.table("cotizaciones").select("id").eq("id", cotizacion_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    update_fields = {}
    if data.estado is not None:
        update_fields["estado"] = data.estado
    if data.monto_mensual_acordado is not None:
        update_fields["monto_mensual_acordado"] = data.monto_mensual_acordado
        update_fields["acordado_por"] = admin["email"]
        update_fields["acordado_en"] = datetime.now(timezone.utc).isoformat()
        if data.estado is None:
            update_fields["estado"] = "cerrado"

    if not update_fields:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    result = supabase.table("cotizaciones").update(update_fields).eq("id", cotizacion_id).execute()
    return _parse_cotizacion(result.data[0])

@api_router.get("/admin/calculadora/modulos", response_model=List[ModuloCalculadora])
def admin_listar_modulos(admin: dict = Depends(get_admin_user)):
    result = supabase.table("calculadora_modulos").select("*").order("orden").execute()
    return [ModuloCalculadora(**m) for m in result.data]

@api_router.post("/admin/calculadora/modulos", response_model=ModuloCalculadora)
def admin_crear_modulo(data: ModuloCalculadoraCreate, admin: dict = Depends(get_admin_user)):
    result = supabase.table("calculadora_modulos").insert(data.model_dump()).execute()
    return ModuloCalculadora(**result.data[0])

@api_router.put("/admin/calculadora/modulos/{modulo_id}", response_model=ModuloCalculadora)
def admin_actualizar_modulo(modulo_id: str, data: ModuloCalculadoraUpdate, admin: dict = Depends(get_admin_user)):
    cambios = {k: v for k, v in data.model_dump().items() if v is not None}
    if not cambios:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    result = supabase.table("calculadora_modulos").update(cambios).eq("id", modulo_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    return ModuloCalculadora(**result.data[0])

@api_router.delete("/admin/calculadora/modulos/{modulo_id}")
def admin_eliminar_modulo(modulo_id: str, admin: dict = Depends(get_admin_user)):
    supabase.table("calculadora_modulos").delete().eq("id", modulo_id).execute()
    return {"message": "Módulo eliminado"}

@api_router.get("/admin/calculadora/tramos", response_model=List[TramoCalculadora])
def admin_listar_tramos(admin: dict = Depends(get_admin_user)):
    result = supabase.table("calculadora_tramos").select("*").order("parametro").order("orden").execute()
    return [TramoCalculadora(**t) for t in result.data]

@api_router.put("/admin/calculadora/tramos/{tramo_id}", response_model=TramoCalculadora)
def admin_actualizar_tramo(tramo_id: str, data: TramoCalculadoraUpdate, admin: dict = Depends(get_admin_user)):
    cambios = {k: v for k, v in data.model_dump().items() if v is not None}
    if not cambios:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    result = supabase.table("calculadora_tramos").update(cambios).eq("id", tramo_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tramo no encontrado")
    return TramoCalculadora(**result.data[0])

@api_router.put("/admin/calculadora/config", response_model=ConfigCalculadora)
def admin_actualizar_config(data: ConfigCalculadora, admin: dict = Depends(get_admin_user)):
    result = supabase.table("calculadora_config").update({
        "recargo_usuario_pct": data.recargo_usuario_pct,
        "dtos_multiempresa": data.dtos_multiempresa,
    }).eq("id", 1).execute()
    return ConfigCalculadora(**result.data[0])

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

@api_router.put("/admin/users/{user_id}/change-password")
def change_user_password(user_id: str, body: ChangePasswordRequest, admin: dict = Depends(get_admin_user)):
    if not body.new_password or len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    existing = supabase.table("users").select("id").eq("id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    supabase.table("users").update({"password_hash": hash_password(body.new_password)}).eq("id", user_id).execute()
    return {"message": "Contraseña actualizada correctamente"}

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

# ============== SSO — MAGIC LINK para Apps ==============

# Mapa de product_id → URL de producción de la App
APP_URLS = {
    "sentinel":         os.environ.get("PEDIDOS_APP_URL",       "http://localhost:5173"),
    "importaciones":    os.environ.get("IMPORTACIONES_APP_URL", "https://websitebillennium-5gsk.vercel.app/"),
    "facturacion":      os.environ.get("FACTURACION_APP_URL",   "https://websitebillennium-quickinvoice.vercel.app/"),
    "contabilidad":     os.environ.get("CONTABILIDAD_APP_URL",  "https://websitebillennium-ledgerpro.vercel.app/"),
    "vendormanagement": os.environ.get("VENDOR_APP_URL",        "https://websitebillennium-vendor.vercel.app/"),
    "restoflow":        os.environ.get("RESTOFLOW_APP_URL",     "https://websitebillennium-restaurantes.vercel.app/"),
    "finance":          os.environ.get("FINANCE_APP_URL",       "https://websitebillennium-finance.vercel.app/"),
}

@api_router.get("/debug/env")
def debug_env():
    """Endpoint temporal de diagnóstico — eliminar después de verificar."""
    return {
        "PEDIDOS_APP_URL": os.environ.get("PEDIDOS_APP_URL", "NO CONFIGURADA"),
        "PEDIDOS_APP_URL_resolved": APP_URLS.get("sentinel"),
        "IMPORTACIONES_APP_URL": os.environ.get("IMPORTACIONES_APP_URL", "NO CONFIGURADA - usando fallback"),
        "IMPORTACIONES_APP_URL_resolved": APP_URLS.get("importaciones"),
        "SUPABASE_URL_set": bool(os.environ.get("SUPABASE_URL")),
        "SUPABASE_KEY_set": bool(os.environ.get("SUPABASE_KEY")),
        "JWT_SECRET_set": bool(os.environ.get("JWT_SECRET")),
    }

@api_router.get("/auth/app-token")
def get_app_token(
    product_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Genera un magic link de Supabase Auth para que el usuario del Portal
    entre a la App sin necesidad de un segundo login.
    """
    if product_id not in APP_URLS:
        raise HTTPException(status_code=400, detail=f"Producto '{product_id}' no soporta SSO aún")

    # Los admins del Portal tienen acceso a todas las apps sin necesitar suscripción
    if current_user.get("role") != "admin":
        sub = supabase.table("subscriptions").select("id").eq(
            "user_id", current_user["id"]
        ).eq("product_id", product_id).eq("status", "active").eq("is_enabled", True).execute()

        if not sub.data:
            raise HTTPException(status_code=403, detail="No tienes acceso activo a esta aplicación")

    redirect_url = APP_URLS[product_id]

    try:
        result = supabase.auth.admin.generate_link({
            "type": "magiclink",
            "email": current_user["email"],
            "options": {"redirect_to": redirect_url}
        })

        # Para Finance Suite: pasar OTP directamente como query param
        # Evita el flujo de redirección con hash que falla por desfase de reloj
        if product_id == "finance":
            from urllib.parse import urlparse, parse_qs, urlencode
            action_link = result.properties.action_link
            parsed = urlparse(action_link)
            params = parse_qs(parsed.query)
            otp_token = params.get("token", [None])[0]
            if otp_token:
                import urllib.parse
                finance_url = f"{redirect_url}?otp={urllib.parse.quote(otp_token)}&email={urllib.parse.quote(current_user['email'])}"
                return {"url": finance_url}

        return {"url": result.properties.action_link}
    except Exception as e:
        logger.error(f"Error generating magic link for {current_user['email']}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al generar acceso: {str(e)}")

@api_router.get("/admin/apps/{product_id}/enter")
def admin_enter_app(product_id: str, admin: dict = Depends(get_admin_user)):
    """
    Genera un magic link para que el admin del Portal entre directamente
    al AdminPanel de la App indicada. Crea el vendedor admin si no existe.
    """
    if product_id not in APP_URLS:
        raise HTTPException(status_code=400, detail=f"La aplicación '{product_id}' no soporta acceso admin aún")

    email = admin["email"]
    name = admin["name"]

    # Para estas apps solo se genera el magic link — el perfil de admin se crea directamente en la BD de cada app
    if product_id in ("importaciones", "facturacion", "vendormanagement", "restoflow", "contabilidad", "finance"):
        try:
            # Finance Suite: garantizar perfil admin en facturacion.profiles
            if product_id == "finance":
                try:
                    from urllib.parse import urlparse, parse_qs, quote as _quote
                    # Obtener user_id del admin
                    admin_id_result = supabase.rpc('get_user_id_by_email', {'p_email': email}).execute()
                    admin_supabase_id = str(admin_id_result.data) if admin_id_result.data else None
                    if not admin_supabase_id:
                        cr = supabase.auth.admin.create_user({
                            "email": email, "email_confirm": True,
                            "password": secrets.token_urlsafe(16),
                            "user_metadata": {"name": name}
                        })
                        admin_supabase_id = str(cr.user.id)
                    # Upsert perfil admin — empresa_id null hasta que se configure
                    existing_p = supabase.schema('facturacion').table('profiles').select('id, rol').eq('id', admin_supabase_id).execute()
                    if not existing_p.data:
                        supabase.schema('facturacion').table('profiles').insert({
                            "id": admin_supabase_id, "rol": "admin_plataforma",
                            "nombre": name, "email": email, "empresa_id": None,
                        }).execute()
                        logger.info(f"Finance admin profile created: {email}")
                    elif existing_p.data[0].get('rol') not in ('admin_plataforma', 'admin', 'superadmin'):
                        supabase.schema('facturacion').table('profiles').update(
                            {"rol": "admin_plataforma"}
                        ).eq('id', admin_supabase_id).execute()
                except Exception as ep:
                    logger.warning(f"Could not upsert finance admin profile: {ep}")

            result = supabase.auth.admin.generate_link({
                "type": "magiclink",
                "email": email,
                "options": {"redirect_to": APP_URLS[product_id]}
            })

            # Finance Suite: usar OTP para evitar desfase de reloj
            if product_id == "finance":
                from urllib.parse import urlparse, parse_qs, quote as _quote
                action_link = result.properties.action_link
                parsed = urlparse(action_link)
                params = parse_qs(parsed.query)
                otp_token = params.get("token", [None])[0]
                if otp_token:
                    return {"url": f"{APP_URLS[product_id]}?otp={_quote(otp_token)}&email={_quote(email)}", "app": product_id}

            return {"url": result.properties.action_link, "app": product_id}
        except Exception as e:
            logger.error(f"Error generating admin magic link for {email}: {e}")
            raise HTTPException(status_code=500, detail=f"Error al generar acceso: {str(e)}")

    # Para sentinel y otras apps: obtener o crear usuario en Supabase Auth
    supabase_user_id = None
    try:
        id_result = supabase.rpc('get_user_id_by_email', {'p_email': email}).execute()
        if id_result.data:
            supabase_user_id = str(id_result.data)
    except Exception:
        pass

    if not supabase_user_id:
        create_result = supabase.auth.admin.create_user({
            "email": email,
            "email_confirm": True,
            "password": secrets.token_urlsafe(16),
            "user_metadata": {"name": name}
        })
        supabase_user_id = str(create_result.user.id)
        logger.info(f"Admin Supabase Auth user created: {email} → {supabase_user_id}")

    # Garantizar vendedor admin en pedidosbillennium
    existing = supabase.schema('pedidosbillennium').table('vendedores').select('id, is_admin').eq('id', supabase_user_id).execute()

    if existing.data:
        if not existing.data[0].get('is_admin'):
            supabase.schema('pedidosbillennium').table('vendedores').update({'is_admin': True}).eq('id', supabase_user_id).execute()
            logger.info(f"Vendedor upgraded to admin: {email}")
    else:
        empresa = supabase.schema('pedidosbillennium').table('empresas').select('id').limit(1).execute()
        empresa_id = empresa.data[0]['id'] if empresa.data else None
        supabase.schema('pedidosbillennium').table('vendedores').insert({
            "id": supabase_user_id,
            "nombre": name,
            "email": email,
            "activo": True,
            "empresa_id": empresa_id,
            "is_admin": True,
            "is_office": False,
        }).execute()
        logger.info(f"Admin vendedor created in pedidosbillennium: {email}")

    # Generar magic link y extraer OTP para evitar desfase de reloj (mismo patrón que finance)
    try:
        from urllib.parse import urlparse, parse_qs, quote
        result = supabase.auth.admin.generate_link({
            "type": "magiclink",
            "email": email,
            "options": {"redirect_to": APP_URLS[product_id]}
        })
        action_link = result.properties.action_link
        parsed = urlparse(action_link)
        params = parse_qs(parsed.query)
        otp_token = params.get("token", [None])[0]
        redirect_url = APP_URLS[product_id]
        if otp_token:
            app_url = f"{redirect_url}?otp={quote(otp_token)}&email={quote(email)}"
            return {"url": app_url, "app": product_id}
        return {"url": action_link, "app": product_id}
    except Exception as e:
        logger.error(f"Error generating admin magic link for {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al generar acceso: {str(e)}")

# ============== APP INTEGRATIONS — SENTINEL (Pedidos Billennium) ==============

class CreateVendedorFromPortalRequest(BaseModel):
    portal_user_id: str
    empresa_id: str
    codven_erp: Optional[int] = None
    is_office: bool = False

def get_supabase_app_admin(x_auth_token: str = Header(None)):
    """Verifica JWT de Supabase enviado en X-Auth-Token (evita que Vercel strip Authorization)."""
    if not x_auth_token:
        raise HTTPException(status_code=401, detail="Token requerido")
    try:
        token = x_auth_token
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Token de Supabase inválido")
        supabase_user_id = str(user_response.user.id)
        vendedor = supabase.schema('pedidosbillennium').table('vendedores').select('id, is_admin').eq('id', supabase_user_id).execute()
        v_data = vendedor.data[0] if vendedor.data else None
        if not v_data or not v_data.get('is_admin'):
            raise HTTPException(status_code=403, detail="No tienes permisos de administrador en App Pedidos")
        return user_response.user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating Supabase token: {e}")
        raise HTTPException(status_code=401, detail="Error de autenticación con Supabase")

@api_router.get("/apps/sentinel/available-users")
def get_sentinel_available_users(app_admin=Depends(get_supabase_app_admin)):
    """
    Devuelve usuarios del Portal con suscripción sentinel activa
    que aún NO tienen registro en pedidosbillennium.vendedores.
    """
    subs = supabase.table("subscriptions").select(
        "user_id, user_email, user_name, company_name"
    ).eq("product_id", "sentinel").eq("status", "active").eq("is_enabled", True).execute()

    if not subs.data:
        return []

    existing = supabase.schema('pedidosbillennium').table('vendedores').select('email').execute()
    existing_emails = {v['email'] for v in (existing.data or [])}

    return [
        {
            "id": s["user_id"],
            "name": s["user_name"],
            "email": s["user_email"],
            "company_name": s.get("company_name"),
        }
        for s in subs.data
        if s["user_email"] not in existing_emails
    ]

@api_router.post("/apps/sentinel/vendedores")
def create_sentinel_vendedor(
    data: CreateVendedorFromPortalRequest,
    app_admin=Depends(get_supabase_app_admin)
):
    """
    Crea usuario en Supabase Auth + registro en pedidosbillennium.vendedores
    para un usuario del Portal que tiene suscripción sentinel activa.
    """
    user_result = supabase.table("users").select("id, email, name").eq("id", data.portal_user_id).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Usuario del Portal no encontrado")
    portal_user = user_result.data[0]

    sub_check = supabase.table("subscriptions").select("id").eq(
        "user_id", data.portal_user_id
    ).eq("product_id", "sentinel").eq("status", "active").eq("is_enabled", True).execute()
    if not sub_check.data:
        raise HTTPException(status_code=403, detail="El usuario no tiene suscripción activa de Pedidos Sentinel")

    empresa_check = supabase.schema('pedidosbillennium').table('empresas').select('id, nombre_comercial').eq('id', data.empresa_id).execute()
    empresa_data = empresa_check.data[0] if empresa_check.data else None
    if not empresa_data:
        raise HTTPException(status_code=404, detail="Empresa no encontrada en App Pedidos")

    email = portal_user["email"]
    name = portal_user["name"]
    temp_password = secrets.token_urlsafe(12)
    supabase_user_id = None

    try:
        create_result = supabase.auth.admin.create_user({
            "email": email,
            "email_confirm": True,
            "password": temp_password,
            "user_metadata": {"name": name}
        })
        supabase_user_id = str(create_result.user.id)
        logger.info(f"Supabase Auth user created: {email} → {supabase_user_id}")
    except Exception as e:
        if any(k in str(e).lower() for k in ["already", "exists", "registered"]):
            try:
                id_result = supabase.rpc('get_user_id_by_email', {'p_email': email}).execute()
                supabase_user_id = str(id_result.data)
                temp_password = None
                logger.info(f"Supabase Auth user already exists: {email} → {supabase_user_id}")
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"No se pudo obtener el ID del usuario existente: {str(e2)}")
        else:
            raise HTTPException(status_code=500, detail=f"Error al crear usuario en Supabase Auth: {str(e)}")

    existing_vendedor = supabase.schema('pedidosbillennium').table('vendedores').select('id').eq('id', supabase_user_id).execute()
    if existing_vendedor.data and len(existing_vendedor.data) > 0:
        raise HTTPException(status_code=400, detail="Este usuario ya tiene un perfil de vendedor en App Pedidos")

    supabase.schema('pedidosbillennium').table('vendedores').insert({
        "id": supabase_user_id,
        "nombre": name,
        "email": email,
        "telefono": None,
        "activo": True,
        "empresa_id": data.empresa_id,
        "is_admin": False,
        "is_office": data.is_office,
        "codven_erp": data.codven_erp,
    }).execute()

    logger.info(f"Vendedor created: {email} → empresa {empresa_data['nombre_comercial']}")

    return {
        "message": f"Acceso creado para {name}",
        "email": email,
        "empresa": empresa_data['nombre_comercial'],
    }

# ============== APP INTEGRATIONS — FINANCE SUITE ==============

class CreateFinanceProfileRequest(BaseModel):
    portal_user_id: str
    empresa_id:     str
    rol:            str = "contador"  # contador | asistente_contable

def get_finance_app_admin(x_auth_token: str = Header(None)):
    """Verifica que el token pertenece a un admin de Finance Suite (facturacion.profiles con rol admin)."""
    if not x_auth_token:
        raise HTTPException(status_code=401, detail="Token requerido")
    try:
        user_response = supabase.auth.get_user(x_auth_token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Token inválido")
        uid = str(user_response.user.id)
        profile = supabase.schema('facturacion').table('profiles').select('rol').eq('id', uid).execute()
        p = profile.data[0] if profile.data else None
        if not p or p.get('rol') not in ('admin', 'superadmin'):
            raise HTTPException(status_code=403, detail="No tienes permisos de administrador en Finance Suite")
        return user_response.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error de autenticación: {str(e)}")

@api_router.get("/apps/finance/available-users")
def get_finance_available_users(app_admin=Depends(get_finance_app_admin)):
    """
    Usuarios del Portal con suscripción finance activa
    que aún NO tienen perfil en facturacion.profiles.
    """
    subs = supabase.table("subscriptions").select(
        "user_id, user_email, user_name, company_name"
    ).eq("product_id", "finance").eq("status", "active").eq("is_enabled", True).execute()

    if not subs.data:
        return []

    existing = supabase.schema('facturacion').table('profiles').select('id').execute()
    existing_ids = {p['id'] for p in (existing.data or [])}

    return [
        {
            "id": s["user_id"],
            "name": s["user_name"],
            "email": s["user_email"],
            "company_name": s.get("company_name"),
        }
        for s in subs.data
        if s["user_id"] not in existing_ids
    ]

@api_router.get("/apps/finance/empresas")
def get_finance_empresas(app_admin=Depends(get_finance_app_admin)):
    """Empresas disponibles en facturacion.empresas."""
    result = supabase.schema('facturacion').table('empresas').select('id, nombre, ruc').order('nombre').execute()
    return result.data or []

@api_router.post("/apps/finance/users")
def create_finance_profile(
    data: CreateFinanceProfileRequest,
    app_admin=Depends(get_finance_app_admin)
):
    """
    Crea perfil en facturacion.profiles para un usuario del Portal
    con suscripción finance activa.
    """
    user_result = supabase.table("users").select("id, email, name").eq("id", data.portal_user_id).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Usuario del Portal no encontrado")
    portal_user = user_result.data[0]

    sub_check = supabase.table("subscriptions").select("id").eq(
        "user_id", data.portal_user_id
    ).eq("product_id", "finance").eq("status", "active").eq("is_enabled", True).execute()
    if not sub_check.data:
        raise HTTPException(status_code=403, detail="El usuario no tiene suscripción activa de Finance Suite")

    emp_check = supabase.schema('facturacion').table('empresas').select('id, nombre').eq('id', data.empresa_id).execute()
    if not emp_check.data:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    email = portal_user["email"]
    name  = portal_user["name"]

    # Obtener o crear usuario en Supabase Auth
    supabase_user_id = None
    try:
        id_result = supabase.rpc('get_user_id_by_email', {'p_email': email}).execute()
        if id_result.data:
            supabase_user_id = str(id_result.data)
    except Exception:
        pass

    if not supabase_user_id:
        try:
            cr = supabase.auth.admin.create_user({
                "email": email, "email_confirm": True,
                "password": secrets.token_urlsafe(16),
                "user_metadata": {"name": name}
            })
            supabase_user_id = str(cr.user.id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error creando usuario Supabase: {str(e)}")

    # Upsert en facturacion.profiles
    supabase.schema('facturacion').table('profiles').upsert({
        "id":         supabase_user_id,
        "empresa_id": data.empresa_id,
        "rol":        data.rol,
        "nombre":     name,
        "email":      email,
    }).execute()

    logger.info(f"Finance profile created: {email} → empresa {emp_check.data[0]['nombre']}")
    return {
        "message": f"Perfil creado para {name}",
        "email":   email,
        "empresa": emp_check.data[0]['nombre'],
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

# ============== SEO: SITEMAP Y ROBOTS ==============

@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.billenniumsystem.com/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://www.billenniumsystem.com/productos</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://www.billenniumsystem.com/planes</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://www.billenniumsystem.com/blog</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://www.billenniumsystem.com/blog/que-es-ats-ecuador</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://www.billenniumsystem.com/blog/facturacion-electronica-obligatoria-ecuador</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://www.billenniumsystem.com/blog/contadores-herramienta-nube-ecuador</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://www.billenniumsystem.com/nosotros</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>https://www.billenniumsystem.com/contacto</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>"""
    return Response(content=content, media_type="application/xml")

@app.get("/robots.txt", include_in_schema=False)
def robots():
    content = "User-agent: *\nAllow: /\n\nSitemap: https://www.billenniumsystem.com/sitemap.xml"
    return Response(content=content, media_type="text/plain")

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

"""
Script para crear usuario admin en Supabase y limpiar datos de prueba.
Ejecutar desde la raiz del proyecto:
  python create_admin_user.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), 'backend', '.env'))

import bcrypt
from supabase import create_client

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')

print(f"Conectando a Supabase: {SUPABASE_URL}")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============ LISTAR USUARIOS ACTUALES ============
print("\n=== USUARIOS ACTUALES ===")
try:
    users = supabase.table("users").select("id, email, name, role, is_active").execute()
    for u in users.data:
        print(f"  [{u['role']}] {u['email']} - {u['name']} - activo: {u['is_active']}")
    print(f"  Total: {len(users.data)} usuarios")
except Exception as e:
    print(f"  ERROR listando usuarios: {e}")

# ============ LIMPIAR SUSCRIPCIONES ============
print("\n=== LIMPIANDO SUSCRIPCIONES ===")
try:
    result = supabase.table("subscriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    print(f"  Suscripciones eliminadas: {len(result.data)}")
except Exception as e:
    print(f"  INFO: {e}")

# ============ ELIMINAR TODOS LOS USUARIOS NO-ADMIN ============
print("\n=== ELIMINANDO USUARIOS NO-ADMIN ===")
try:
    result = supabase.table("users").delete().neq("role", "blocked_placeholder").execute()
    print(f"  Usuarios eliminados: {len(result.data)}")
except Exception as e:
    print(f"  INFO: {e}")

# ============ CREAR ADMIN ============
print("\n=== CREANDO USUARIO ADMIN ===")
ADMIN_EMAIL = "admin@billennium.com"
ADMIN_PASSWORD = "Admin2024!"
ADMIN_NAME = "Administrador Billennium"

# Hash password
hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Verificar si ya existe
existing = supabase.table("users").select("id, email").eq("email", ADMIN_EMAIL).execute()
if existing.data:
    print(f"  Admin ya existe, actualizando password y role...")
    supabase.table("users").update({
        "password_hash": hashed,
        "role": "admin",
        "is_active": True,
        "name": ADMIN_NAME
    }).eq("email", ADMIN_EMAIL).execute()
    print(f"  Admin actualizado: {ADMIN_EMAIL}")
else:
    print(f"  Creando nuevo admin...")
    new_admin = {
        "email": ADMIN_EMAIL,
        "name": ADMIN_NAME,
        "password_hash": hashed,
        "role": "admin",
        "is_active": True,
    }
    result = supabase.table("users").insert(new_admin).execute()
    print(f"  Admin creado: {result.data[0]['email']} (id: {result.data[0]['id']})")

# ============ VERIFICACION FINAL ============
print("\n=== ESTADO FINAL ===")
users = supabase.table("users").select("id, email, name, role, is_active").execute()
for u in users.data:
    print(f"  [{u['role']}] {u['email']} | activo: {u['is_active']}")

subs = supabase.table("subscriptions").select("id").execute()
print(f"\n  Suscripciones restantes: {len(subs.data)}")

print("\n✅ LISTO - Credenciales admin:")
print(f"   Email: {ADMIN_EMAIL}")
print(f"   Password: {ADMIN_PASSWORD}")

from supabase import create_client
import bcrypt, os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path('.env'))
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])

def hash_password(pwd):
    return bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Crear admin principal facturacion@billenniumsystem.com
email = 'facturacion@billenniumsystem.com'
existing = sb.table('users').select('id').eq('email', email).execute()
if existing.data:
    print(f'Usuario {email} ya existe')
else:
    r = sb.table('users').insert({
        'email': email,
        'name': 'Administrador Billennium',
        'password_hash': hash_password('Admin2024!'),
        'role': 'admin',
        'is_active': True,
    }).execute()
    created = r.data[0]
    print(f"Admin creado: {created['email']} | role: {created['role']} | id: {created['id']}")

# Listar todos los usuarios
print()
print('Usuarios en Supabase:')
users = sb.table('users').select('id, email, name, role, is_active').execute()
for u in users.data:
    estado = 'activo' if u['is_active'] else 'inactivo'
    print(f"  [{u['role']}] {u['email']} -- {estado}")

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://neqhhmpvfiggevldfukf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lcWhobXB2ZmlnZ2V2bGRmdWtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDYxNDksImV4cCI6MjA4ODkyMjE0OX0.lwVxTdnje0w_k5v6QxXWhR_h5kIiD7ICETBTaKVQY0g'
);

async function createUsers() {
  console.log('Creando super admin...');
  const { data: superAdmin, error: superErr } = await supabase.auth.signUp({
    email: 'super@importcloud.com',
    password: 'super123',
  });
  if (superErr) console.error('Error super admin:', superErr.message);
  else console.log('Super admin creado en Auth:', superAdmin.user?.id);

  console.log('Creando usuario...');
  const { data: user1, error: userErr } = await supabase.auth.signUp({
    email: 'usuario@importcloud.com',
    password: 'demo123',
  });
  if (userErr) console.error('Error usuario:', userErr.message);
  else console.log('Usuario creado en Auth:', user1.user?.id);
  
  // Registrar el superadmin en public.usuarios (para los roles)
  if (superAdmin.user) {
    const { error: insertErr } = await supabase.from('usuarios').insert({
      id: superAdmin.user.id,
      nombre: 'Super Administrador',
      email: 'super@importcloud.com',
      rol: 'SUPERADMIN'
    });
    if (insertErr) console.error('Error insertando en public.usuarios:', insertErr.message);
    else console.log('Super admin insertado en public.usuarios con exito.');
  }
}

createUsers();

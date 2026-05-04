@echo off
echo ========================================
echo   DESPLIEGUE A GITHUB/VERCEL
echo ========================================
echo.
echo Este script subirá los cambios a GitHub
echo Vercel detectará los cambios automáticamente
echo.
pause

echo.
echo [1/3] Agregando archivos...
git add .

echo.
echo [2/3] Creando commit...
git commit -m "Implementacion de IA y Chat Centralizado"

echo.
echo [3/3] Subiendo a GitHub...
git push origin main

echo.
echo ========================================
echo   COMPLETADO
echo ========================================
echo.
echo Los cambios fueron subidos a GitHub.
echo Vercel los desplegará automáticamente.
echo.
echo IMPORTANTE: No olvides ejecutar el SQL
echo en Supabase antes de probar la app.
echo.
pause

@echo off
chcp 65001 >nul
title Higgsfield Studio - ZALYATSU AI
cd /d "%~dp0"

echo.
echo   =====================================
echo     HIGGSFIELD STUDIO  -  ZALYATSU AI
echo   =====================================
echo.

rem --- 1. Verifier que Node.js est installe ---
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js n'est pas installe sur ce PC.
  echo     Installe la version LTS sur nodejs.org puis relance ce fichier.
  start "" https://nodejs.org
  pause
  exit /b 1
)

rem --- 2. Installer les dependances (premiere fois seulement) ---
if not exist "node_modules" (
  echo [..] Premiere utilisation : installation des dependances...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [X] L'installation a echoue. Verifie ta connexion internet.
    pause
    exit /b 1
  )
)

rem --- 3. Creer le fichier de configuration .env (premiere fois seulement) ---
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [!] Remplis le fichier qui va s'ouvrir dans le Bloc-notes :
  echo       HF_API_KEY   = ta cle Higgsfield
  echo       APP_USERNAME = ton identifiant
  echo       APP_PASSWORD = un mot de passe de 16 caracteres minimum
  echo     Enregistre avec Ctrl+S, ferme le Bloc-notes, et ca continue.
  start /wait notepad ".env"
)

rem --- 4. Lire le port choisi dans .env (3000 par defaut) ---
set "PORT=3000"
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="PORT" if not "%%B"=="" set "PORT=%%B"
)

rem --- 5. Ouvrir le navigateur quelques secondes apres le demarrage ---
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"

echo [OK] Demarrage sur http://localhost:%PORT%
echo      Garde cette fenetre ouverte. Ferme-la pour arreter le studio.
echo.
node --env-file=.env server.js

echo.
echo [X] Le studio s'est arrete. Lis le message ci-dessus.
echo     Pour changer ta cle ou ton mot de passe : ouvre le fichier .env
pause

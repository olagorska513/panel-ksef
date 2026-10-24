@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p LOGIN=Podaj login nowej osoby (np. jan.kowalski): 
if "%LOGIN%"=="" goto :eof
node narzedzia\uzytkownicy.mjs dodaj "%LOGIN%" --opublikuj
echo.
pause

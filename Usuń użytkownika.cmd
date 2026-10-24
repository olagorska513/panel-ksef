@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p LOGIN=Podaj login osoby do usunięcia: 
if "%LOGIN%"=="" goto :eof
node narzedzia\uzytkownicy.mjs usun "%LOGIN%" --opublikuj
echo.
pause

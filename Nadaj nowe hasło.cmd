@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p LOGIN=Podaj login osoby, której nadać nowe hasło: 
if "%LOGIN%"=="" goto :eof
node narzedzia\uzytkownicy.mjs nowe-haslo "%LOGIN%" --opublikuj
echo.
pause

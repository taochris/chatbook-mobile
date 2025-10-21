@echo off
echo Recherche de Java...
echo.

if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" (
    echo TROUVE: C:\Program Files\Android\Android Studio\jbr\bin\java.exe
) else (
    echo NON TROUVE: C:\Program Files\Android\Android Studio\jbr\bin\java.exe
)

if exist "C:\Program Files\Android\Android Studio1\jbr\bin\java.exe" (
    echo TROUVE: C:\Program Files\Android\Android Studio1\jbr\bin\java.exe
) else (
    echo NON TROUVE: C:\Program Files\Android\Android Studio1\jbr\bin\java.exe
)

echo.
echo Listing du dossier Android:
dir "C:\Program Files\Android" /b

pause

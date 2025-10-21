# 🔧 Génération des dossiers natifs Android/iOS

## Méthode recommandée : Utiliser un projet template

### Étape 1 : Créer un projet temporaire

Ouvrez un terminal dans `c:\Users\tao\Desktop\applications_creees\` :

```bash
npx react-native@latest init ChatbookTemp
```

Attendez que le projet soit créé (2-3 minutes).

### Étape 2 : Copier les dossiers natifs

Une fois créé, copiez les dossiers :

```bash
# Copier le dossier android
xcopy /E /I ChatbookTemp\android chatbook-mobile\android

# Copier le dossier ios
xcopy /E /I ChatbookTemp\ios chatbook-mobile\ios

# Supprimer le projet temporaire
rmdir /S /Q ChatbookTemp
```

### Étape 3 : Mettre à jour les noms

#### Dans `android/app/src/main/AndroidManifest.xml` :
Remplacer `ChatbookTemp` par `ChatbookExport`

#### Dans `android/app/build.gradle` :
```gradle
defaultConfig {
    applicationId "com.chatbookexport"
    // ...
}
```

#### Dans `android/app/src/main/java/com/chatbooktemp/` :
Renommer le dossier en `chatbookexport`

### Étape 4 : Ajouter les permissions SMS

Dans `android/app/src/main/AndroidManifest.xml`, ajouter :

```xml
<manifest>
  <uses-permission android:name="android.permission.READ_SMS" />
  <uses-permission android:name="android.permission.READ_CONTACTS" />
  <uses-permission android:name="android.permission.INTERNET" />
  
  <application>
    <!-- ... -->
  </application>
</manifest>
```

### Étape 5 : Lier react-native-get-sms-android

Dans `android/app/build.gradle`, ajouter :

```gradle
dependencies {
    implementation project(':react-native-get-sms-android')
    // ...
}
```

Dans `android/settings.gradle`, ajouter :

```gradle
include ':react-native-get-sms-android'
project(':react-native-get-sms-android').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-get-sms-android/android')
```

### Étape 6 : Tester

```bash
cd chatbook-mobile
npm start

# Dans un autre terminal
npm run android
```

---

## Alternative : Utiliser le CLI directement

Si vous avez React Native CLI installé globalement :

```bash
cd chatbook-mobile
react-native init ChatbookExport --directory . --skip-install
```

Cela créera les dossiers `android/` et `ios/` directement dans le dossier actuel.

---

## Vérification

Une fois les dossiers créés, vous devriez avoir :

```
chatbook-mobile/
├── android/
│   ├── app/
│   ├── gradle/
│   ├── build.gradle
│   └── settings.gradle
├── ios/
│   ├── ChatbookExport/
│   ├── ChatbookExport.xcodeproj/
│   └── Podfile
├── src/
│   ├── screens/
│   ├── services/
│   └── utils/
├── App.js
├── index.js
└── package.json
```

---

## 🐛 Problèmes courants

### "SDK location not found"
Créer `android/local.properties` :
```
sdk.dir=C:\\Users\\VOTRE_NOM\\AppData\\Local\\Android\\Sdk
```

### "Command failed: gradlew.bat"
Vérifier que Java JDK est installé :
```bash
java -version
```

### "Unable to load script"
Nettoyer le cache :
```bash
npm start -- --reset-cache
```

---

**Prochaine étape** : Une fois les dossiers créés, configurez Firebase !

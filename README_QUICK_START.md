# 🚀 Quick Start - Chatbook Export Mobile

## ✅ État actuel

Tout le code React Native est prêt ! Il ne manque que les dossiers natifs Android/iOS.

## 🎯 Pour démarrer (3 options)

### Option 1 : Script automatique (Recommandé) ⚡

Double-cliquez sur `setup-native.bat`

Le script va :
1. Créer un projet React Native temporaire
2. Copier les dossiers `android/` et `ios/`
3. Nettoyer le projet temporaire

### Option 2 : Commande manuelle 💻

```bash
cd c:\Users\tao\Desktop\applications_creees

# Créer projet temporaire
npx react-native@latest init ChatbookTemp --skip-install

# Copier les dossiers
xcopy /E /I ChatbookTemp\android chatbook-mobile\android
xcopy /E /I ChatbookTemp\ios chatbook-mobile\ios

# Supprimer le temporaire
rmdir /S /Q ChatbookTemp
```

### Option 3 : React Native CLI direct 🔧

```bash
cd chatbook-mobile
npx react-native init ChatbookExport --directory . --skip-install
```

---

## 📱 Après avoir les dossiers natifs

### 1. Configurer Firebase

Télécharger depuis [Firebase Console](https://console.firebase.google.com/) :
- `google-services.json` → `android/app/`
- `GoogleService-Info.plist` → `ios/ChatbookExport/`

### 2. Installer Firebase

```bash
npm install @react-native-firebase/app @react-native-firebase/database @react-native-firebase/storage
```

### 3. Ajouter les permissions SMS

Dans `android/app/src/main/AndroidManifest.xml` :

```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

### 4. Lancer l'app

```bash
npm start          # Terminal 1
npm run android    # Terminal 2
```

---

## 📂 Structure complète (une fois terminé)

```
chatbook-mobile/
├── android/              ⏳ À générer
│   ├── app/
│   ├── gradle/
│   └── build.gradle
├── ios/                  ⏳ À générer
│   ├── ChatbookExport/
│   └── Podfile
├── src/                  ✅ Créé
│   ├── screens/          ✅ ConversationListScreen, ExportScreen
│   ├── services/         ✅ smsService, firebaseService
│   └── utils/            ✅ Créé
├── App.js                ✅ Créé
├── index.js              ✅ Créé
├── package.json          ✅ Créé (dépendances installées)
└── README.md             ✅ Documentation
```

---

## 🎨 Fonctionnalités déjà implémentées

- ✅ Liste des conversations SMS
- ✅ Demande de permissions Android
- ✅ Sélection de conversation
- ✅ Export vers Firebase
- ✅ Génération de code à 6 caractères
- ✅ Affichage du code avec copie
- ✅ Deux options : Mobile ou PC
- ✅ Bouton "Ouvrir dans le navigateur"
- ✅ Style cohérent avec l'app web

---

## 🔗 Intégration Web ↔ Mobile

### Côté Web (déjà fait) :
- ✅ `mobileImportService.js` - Gestion des codes Firebase
- ✅ `MobileImport.js` - Interface pour entrer le code
- ✅ Téléchargement automatique des données

### Côté Mobile (prêt) :
- ✅ Lecture des SMS Android
- ✅ Upload vers Firebase
- ✅ Génération du code
- ⏳ Activation Firebase (décommenter le code)

---

## 🧪 Test du flux complet

1. **Mobile** : Lancer l'app → Sélectionner conversation → Exporter
2. **Code** : Noter le code à 6 caractères (ex: ABC123)
3. **Web** : Aller sur chatbook.app → Importer → Entrer le code
4. **Succès** : Les messages apparaissent dans MessageEditor ! 🎉

---

## 📚 Documentation

- `SETUP.md` - Configuration détaillée
- `GENERATE_NATIVE.md` - Génération des dossiers natifs
- `NEXT_STEPS.md` - Roadmap complète
- `setup-native.bat` - Script automatique

---

## 💡 Besoin d'aide ?

1. Vérifier que Node.js 18+ est installé
2. Vérifier qu'Android Studio est installé
3. Vérifier que ANDROID_HOME est configuré
4. Consulter `SETUP.md` pour le dépannage

---

**Vous êtes à 1 étape du lancement ! 🚀**

Exécutez `setup-native.bat` ou suivez l'Option 2/3 ci-dessus.

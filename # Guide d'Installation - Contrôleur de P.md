# Guide d'Installation - Contrôleur de Porte RFID pour ABM EduPilote

Ce guide explique comment installer et configurer le système de contrôle d'accès par carte RFID avec un ESP32.

## 1. Prérequis Matériels

-   Un microcontrôleur **ESP32**.
-   Un **lecteur de carte RFID avec sortie Wiegand** (le plus commun est le Wiegand 26-bit).
-   Un **module relais 5V** compatible avec l'ESP32.
-   Une **gâche électrique** (12V ou autre, selon votre modèle).
-   Une **alimentation externe** pour la gâche électrique (ex: adaptateur 12V).
-   Des fils de connexion (type Dupont).

## 2. Schéma de Câblage

**ATTENTION : Manipulez les connexions électriques avec précaution. Débranchez toutes les alimentations avant de faire des modifications.**

### a) Connexion du Lecteur RFID à l'ESP32

| Lecteur RFID | Broche ESP32 | Description             |
| :----------- | :----------- | :---------------------- |
| D0 (Data 0)  | **GPIO 16**  | Fil vert (généralement) |
| D1 (Data 1)  | **GPIO 17**  | Fil blanc (généralement)|
| VCC / +5V    | **5V**       | Alimentation du lecteur |
| GND          | **GND**      | Masse                   |

### b) Connexion du Module Relais à l'ESP32

| Module Relais | Broche ESP32 | Description          |
| :------------ | :----------- | :------------------- |
| VCC           | **5V**       | Alimentation du relais |
| GND           | **GND**      | Masse                |
| IN (Input)    | **GPIO 23**  | Signal de commande   |

### c) Connexion de la Gâche Électrique au Relais

La gâche électrique est alimentée par son propre adaptateur secteur (ex: 12V). Le relais agit comme un interrupteur.

1.  Connectez le pôle **positif (+)** de votre alimentation 12V à la borne **COM** (Commun) du relais.
2.  Connectez la borne **NO** (Normally Open / Normalement Ouvert) du relais à l'une des bornes de la gâche électrique.
3.  Connectez l'autre borne de la gâche électrique au pôle **négatif (-)** de votre alimentation 12V.

*Pourquoi `NO` ?* En utilisant `NO`, la gâche n'est alimentée (et donc déverrouillée) que lorsque l'ESP32 active le relais. En cas de coupure de courant, la porte reste verrouillée (sécurité "fail-secure").

## 3. Configuration Logicielle

### a) Google Apps Script

1.  **Mise à jour du script** : Copiez le contenu du fichier `appscript.js` modifié et collez-le dans votre projet Google Apps Script.
2.  **Déploiement** :
    *   Cliquez sur **Déployer > Nouveau déploiement**.
    *   Sélectionnez le type "Application Web".
    *   Dans "Qui a accès", choisissez **"Tout le monde"**.
    *   Cliquez sur **Déployer**.
    *   **IMPORTANT** : Copiez l'URL de l'application web. Vous en aurez besoin pour l'ESP32.

### b) Arduino IDE pour l'ESP32

1.  **Installer l'IDE Arduino** si ce n'est pas déjà fait.
2.  **Installer le support ESP32** :
    *   Allez dans `Fichier > Préférences`.
    *   Dans "URL de gestionnaire de cartes supplémentaires", ajoutez : `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
    *   Allez dans `Outils > Type de carte > Gestionnaire de cartes`, cherchez "esp32" et installez le paquet par Espressif Systems.
3.  **Installer les bibliothèques** :
    *   Allez dans `Croquis > Inclure une bibliothèque > Gérer les bibliothèques`.
    *   Cherchez et installez :
        *   `Wiegand-ESP32` par monkeyboard
        *   `ArduinoJson` par Benoit Blanchon
4.  **Configurer et Téléverser le code** :
    *   Ouvrez le fichier `esp32_door_controller.ino`.
    *   Modifiez les lignes suivantes avec vos informations :
        ```cpp
        const char* ssid = "NOM_DE_VOTRE_WIFI";
        const char* password = "MOT_DE_PASSE_WIFI";
        String scriptUrl = "VOTRE_URL_APPS_SCRIPT_ICI";
        ```
    *   Branchez votre ESP32 à votre ordinateur.
    *   Dans `Outils`, sélectionnez la bonne carte (ex: "ESP32 Dev Module") et le bon port COM.
    *   Cliquez sur le bouton **Téléverser**.

## 4. Test du Système

1.  Ouvrez le **Moniteur Série** dans l'IDE Arduino (vitesse 115200 bauds).
2.  Vérifiez que l'ESP32 se connecte bien au Wi-Fi.
3.  Scannez une carte RFID qui est assignée à un étudiant dans votre feuille `Étudiants`.
4.  **Cas 1 (Accès autorisé)** :
    *   Assurez-vous qu'un cours est planifié et **confirmé** pour la classe de cet étudiant à l'heure actuelle.
    *   Le moniteur série devrait afficher "Accès autorisé".
    *   Vous devriez entendre le relais cliquer et la gâche électrique se déverrouiller pendant 3 secondes.
5.  **Cas 2 (Accès refusé)** :
    *   Assurez-vous qu'aucun cours n'est planifié pour l'étudiant.
    *   Le moniteur série devrait afficher "Accès refusé. Raison: Aucun cours en ce moment."
    *   Le relais ne doit pas s'activer.

## 5. En Cas d'Erreur de Compilation (Dépannage)

Si vous rencontrez des erreurs de compilation mentionnant que les fonctions `begin`, `available` ou `getCode` n'existent pas (`'class Wiegand' has no member named '...'`), cela est très probablement dû à un **conflit de bibliothèques**.

L'IDE Arduino a peut-être trouvé une autre bibliothèque nommée "Wiegand" qui n'est pas la bonne.

### Solution :

1.  **Fermez l'IDE Arduino.**

2.  **Nettoyez les bibliothèques conflictuelles :**
    *   Allez dans le dossier de vos bibliothèques Arduino. Il se trouve généralement ici : `C:\Users\[Votre Nom d'Utilisateur]\Documents\Arduino\libraries`.
    *   Cherchez tous les dossiers qui s'appellent `Wiegand`, `Wiegand-ESP32`, ou un nom similaire.
    *   **Supprimez** tous ces dossiers pour repartir sur une base propre.

3.  **Réinstallez la bonne bibliothèque :**
    *   Ouvrez l'IDE Arduino.
    *   Allez dans `Croquis > Inclure une bibliothèque > Gérer les bibliothèques...`.
    *   Cherchez **`Wiegand-ESP32`** par **`monkeyboard`** et installez-la. Assurez-vous que c'est bien celle-ci.

4.  **Recompilez votre code :**
    *   Ouvrez à nouveau votre fichier `.ino` et cliquez sur **Téléverser**. Les erreurs devraient avoir disparu.

Félicitations, votre système de contrôle d'accès est maintenant intégré à ABM EduPilote !

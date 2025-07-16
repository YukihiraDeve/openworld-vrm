# Système d'Émotes - Documentation

## Vue d'ensemble
Le système d'émotes permet aux joueurs de déclencher des animations temporaires comme dans Fortnite. Les émotes sont synchronisées entre tous les joueurs via le multijoueur.

## Fonctionnalités

### Contrôles
- **Touche B** : Ouvrir/fermer le menu d'émotes
- **Touche 1** : Déclencher directement l'émote "Salut" (animation)
- **Touche 2** : Déclencher directement l'émote "Sourire" (expression)
- **Touche 3** : Déclencher directement l'émote "Tristesse" (expression)
- **Touche 4** : Déclencher directement l'émote "Colère" (expression)
- **Touche 5** : Déclencher directement l'émote "Surprise" (expression)
- **Touche 6** : Déclencher directement l'émote "Neutre" (expression)
- **Échap** : Fermer le menu d'émotes

### Interface
- Menu d'émotes avec interface moderne et responsive
- Animations fluides d'ouverture/fermeture
- Indicateurs visuels pour les émotes actives
- Support tactile pour mobile
- **Nouveau** : Deux types d'émotes (animations FBX et expressions faciales VRM)
- **Nouveau** : 6 expressions faciales intégrées (sourire, tristesse, colère, surprise, neutre, salut)

## Architecture

### Composants principaux

1. **EmoteMenu** (`src/ui/EmoteMenu/EmoteMenu.jsx`)
   - Interface utilisateur pour sélectionner les émotes
   - Gestion des événements clavier et souris
   - Fermeture automatique après sélection

2. **useEmoteSystem** (`src/hooks/useEmoteSystem.jsx`)
   - Hook personnalisé pour gérer l'état des émotes
   - Minuterie automatique pour arrêter les émotes
   - Gestion de l'ouverture/fermeture du menu

3. **VrmAvatar** (modifié)
   - Support des animations d'émotes temporaires
   - Priorité des émotes sur les animations de locomotion
   - Transitions fluides entre animations

4. **Player** (modifié)
   - Intégration du système d'émotes
   - Gestion des callbacks d'émotes
   - Communication avec le multijoueur

### Multijoueur
- Synchronisation des émotes via Socket.IO
- Événement `playerEmote` pour diffuser les émotes
- Arrêt automatique des émotes après 4 secondes

## Configuration

### Ajouter une nouvelle émote

1. **Ajouter l'animation aux constantes** (`src/utils/const.jsx`):
```javascript
export const ANIMATIONS = {
  // ... autres animations
  'dance': '/assets/animations/Dance.fbx'
};
```

2. **Ajouter l'émote au menu** (`src/ui/EmoteMenu/EmoteMenu.jsx`):
```javascript
const EMOTES = [
  // ... autres émotes
  {
    id: 'dance',
    name: 'Danse',
    icon: '💃',
    key: '2',
    animation: 'dance'
  }
];
```

3. **Placer le fichier d'animation** dans `public/assets/animations/Dance.fbx`

### Personnalisation
- Durée des émotes : Modifier le timeout dans `useEmoteSystem.jsx` (défaut: 4 secondes)
- Styles du menu : Modifier `src/ui/EmoteMenu/EmoteMenu.css`
- Touche d'ouverture du menu : Modifier `src/experience/controller/KeyboardController.jsx`

## Fichiers modifiés

- ✅ `src/utils/const.jsx` - Ajout de l'animation Salute
- ✅ `src/ui/EmoteMenu/` - Nouveau composant de menu (avec expressions)
- ✅ `src/hooks/useEmoteSystem.jsx` - Nouveau hook d'état (support expressions)
- ✅ `src/hooks/useVRMExpressions.jsx` - **Nouveau** hook pour expressions faciales
- ✅ `src/hooks/useEyeBlink.jsx` - **Nouveau** hook de clignement d'yeux
- ✅ `src/components/VrmAvatar.jsx` - Support des émotes et expressions
- ✅ `src/experience/Player.jsx` - Intégration du système complet
- ✅ `src/experience/controller/KeyboardController.jsx` - Touche B
- ✅ `src/experience/multiplayer/` - Synchronisation multijoueur (avec types)
- ✅ `src/context/EmoteContext.jsx` - **Nouveau** contexte global d'émotes
- ✅ `Server/app.js` - Gestion serveur des émotes et expressions

## Utilisation

1. **Lancer le serveur** : `cd Server && npm start`
2. **Lancer le client** : `npm run dev`
3. **Tester les émotes** :
   - Appuyez sur **B** pour ouvrir le menu d'émotes
   - **Animations** : Cliquez sur "Salut" ou appuyez sur **1** (4 secondes)
   - **Expressions** : Cliquez sur "Sourire" ou appuyez sur **2** (3 secondes)
   - Testez toutes les expressions : **3** (tristesse), **4** (colère), **5** (surprise), **6** (neutre)
   - Toutes les émotes sont visibles par tous les joueurs connectés
   - Les expressions faciales sont compatibles avec la marche/course

## Débogage

### Problèmes courants
- **Animation ne se charge pas** : Vérifiez que le fichier .fbx est dans `public/assets/animations/`
- **Émote ne se synchronise pas** : Vérifiez la connexion Socket.IO
- **Menu ne s'ouvre pas** : Vérifiez que la touche B n'est pas interceptée ailleurs

### Logs utiles
```javascript
console.log("Émote sélectionnée:", emote.name); // Player.jsx
console.log("Emitting emote:", emoteData); // MultiplayerProvider.jsx
```

## Nouveau : Système de Clignement d'Yeux 👀

### Fonctionnalités
- **Clignement automatique** : Les personnages clignent des yeux toutes les 5 secondes
- **Démarrage graduel** : Premier clignement après 2 secondes, puis intervalles réguliers
- **Compatibilité VRM** : Fonctionne avec les modèles VRM 0.x et 1.0
- **Gestion d'erreurs** : Essaie différents noms d'expressions pour maximiser la compatibilité

### Implémentation
Le système utilise un hook personnalisé `useEyeBlink` qui :
- Contrôle les expressions faciales VRM
- Gère les timers automatiques
- Nettoie les ressources proprement
- Empêche les clignements multiples simultanés

### Utilisation
```javascript
import useEyeBlink from '../hooks/useEyeBlink';

// Dans votre composant VRM
const { triggerEyeBlink, isBlinking } = useEyeBlink(vrmRef, 5000, 150, 2000);
//                                                  ^      ^    ^     ^
//                                                  |      |    |     |
//                                                  |      |    |     Délai initial (2s)
//                                                  |      |    Durée du clignement (150ms)
//                                                  |      Intervalle entre clignements (5s)
//                                                  Référence VRM
```

### Fichiers ajoutés/modifiés
- ✅ `src/hooks/useEyeBlink.jsx` - Nouveau hook de clignement d'yeux
- ✅ `src/components/VrmAvatar.jsx` - Intégration du système

## Nouveau : Expressions Faciales VRM 😊😢😠😲

### Fonctionnalités des expressions
- **Sourire** (😊) : Expression de joie et bonheur
- **Tristesse** (😢) : Expression de mélancolie  
- **Colère** (😠) : Expression de frustration ou irritation
- **Surprise** (😲) : Expression d'étonnement
- **Neutre** (😐) : Expression calme et détendue
- **Salut** (🫡) : Animation de salutation militaire

### Types d'émotes
1. **Animations FBX** : Animations corporelles complètes (ex: Salut)
   - Durée : 4 secondes
   - Interrompent la locomotion normale
   - Fichiers .fbx requis

2. **Expressions faciales VRM** : Expressions du visage uniquement
   - Durée : 3 secondes
   - Compatible avec la locomotion (marche/course)
   - Utilise l'API VRM native

### Implémentation technique
Le système utilise deux hooks :
- `useEmoteSystem` : Gestion globale des émotes
- `useVRMExpressions` : Contrôle des expressions faciales VRM

```javascript
// Exemple d'utilisation
const { triggerExpression } = useVRMExpressions(vrmRef);
triggerExpression('happy', 1.0, 3000); // Sourire à 100% pendant 3s
```

### Compatibilité
- Fonctionne avec les modèles VRM 0.x et 1.0
- Essaie automatiquement plusieurs noms d'expressions
- Fallback gracieux si l'expression n'est pas supportée

## Prochaines améliorations possibles

- [ ] Émotes avec son synchronisé
- [ ] Émotes qui bougent le personnage (dance avec déplacement)
- [ ] Menu d'émotes par roue comme Fortnite
- [ ] Émotes déblocables/achetables
- [ ] Émotes de groupe (synchronisées entre joueurs)
- [ ] Aperçu des émotes dans le menu
- [ ] Autres expressions faciales (sourire, tristesse, surprise)
- [ ] Clignement d'yeux synchronisé avec les émotions 
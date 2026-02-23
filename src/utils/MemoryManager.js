import * as THREE from 'three';

class MemoryManager {
  constructor() {
    this.textures = new Map();
    this.geometries = new Map();
    this.materials = new Map();
    this.meshes = new WeakSet();
    this.disposables = new Set();
    
    this.memoryStats = {
      textures: 0,
      geometries: 0,
      materials: 0,
      totalMemory: 0
    };
    
    this.lastCleanup = 0;
    this.cleanupInterval = 30000; // 30 secondes
    
    // Surveiller les performances
    this.isLowMemory = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); // Par défaut true sur mobile
    this.memoryThreshold = 0.8; // 80% de la mémoire utilisée
  }

  // Gestionnaire de textures avec cache
  getTexture(url, loader = new THREE.TextureLoader()) {
    if (this.textures.has(url)) {
      return this.textures.get(url);
    }

    const texture = loader.load(url);
    this.textures.set(url, texture);
    this.disposables.add(texture);
    
    // Optimiser la texture
    this.optimizeTexture(texture);
    
    return texture;
  }

  // Optimiser une texture
  optimizeTexture(texture) {
    // Réduire la qualité si en mode faible mémoire
    if (this.isLowMemory) {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
    } else {
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
    }
    
    // Définir les paramètres de wrap par défaut
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    // Forcer la mise à jour
    texture.needsUpdate = true;
  }

  // Gestionnaire de géométries avec cache
  getGeometry(key, creator) {
    if (this.geometries.has(key)) {
      return this.geometries.get(key);
    }

    const geometry = creator();
    this.geometries.set(key, geometry);
    this.disposables.add(geometry);
    
    return geometry;
  }

  // Gestionnaire de matériaux avec cache
  getMaterial(key, creator) {
    if (this.materials.has(key)) {
      return this.materials.get(key);
    }

    const material = creator();
    this.materials.set(key, material);
    this.disposables.add(material);
    
    return material;
  }

  // Enregistrer un mesh pour surveillance
  registerMesh(mesh) {
    this.meshes.add(mesh);
  }

  // Nettoyer la mémoire
  cleanup() {
    const now = performance.now();
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }

    console.log('[MemoryManager] Démarrage du nettoyage mémoire');
    
    let cleanedCount = 0;
    
    // Nettoyer les textures inutilisées
    for (const [url, texture] of this.textures.entries()) {
      if (this.isTextureUnused(texture)) {
        texture.dispose();
        this.textures.delete(url);
        this.disposables.delete(texture);
        cleanedCount++;
      }
    }
    
    // Nettoyer les géométries inutilisées
    for (const [key, geometry] of this.geometries.entries()) {
      if (this.isGeometryUnused(geometry)) {
        geometry.dispose();
        this.geometries.delete(key);
        this.disposables.delete(geometry);
        cleanedCount++;
      }
    }
    
    // Nettoyer les matériaux inutilisés
    for (const [key, material] of this.materials.entries()) {
      if (this.isMaterialUnused(material)) {
        material.dispose();
        this.materials.delete(key);
        this.disposables.delete(material);
        cleanedCount++;
      }
    }
    
    // Forcer le garbage collection si possible
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
    }
    
    this.lastCleanup = now;
    this.updateMemoryStats();
    
    console.log(`[MemoryManager] Nettoyage terminé: ${cleanedCount} objets supprimés`);
  }

  // Vérifier si une texture est inutilisée
  isTextureUnused(texture) {
    // Logique simple: vérifier si la texture a un faible refCount
    return texture.userData?.lastUsed && 
           (performance.now() - texture.userData.lastUsed) > 60000; // 1 minute
  }

  // Vérifier si une géométrie est inutilisée
  isGeometryUnused(geometry) {
    return geometry.userData?.lastUsed && 
           (performance.now() - geometry.userData.lastUsed) > 60000;
  }

  // Vérifier si un matériau est inutilisé
  isMaterialUnused(material) {
    return material.userData?.lastUsed && 
           (performance.now() - material.userData.lastUsed) > 60000;
  }

  // Marquer un objet comme utilisé
  markAsUsed(object) {
    if (object) {
      if (!object.userData) {
        object.userData = {};
      }
      object.userData.lastUsed = performance.now();
    }
  }

  // Mettre à jour les statistiques mémoire
  updateMemoryStats() {
    this.memoryStats = {
      textures: this.textures.size,
      geometries: this.geometries.size,
      materials: this.materials.size,
      totalMemory: this.estimateMemoryUsage()
    };
    
    // Vérifier si on est en situation de faible mémoire
    if (performance.memory) {
      const memoryRatio = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
      this.isLowMemory = memoryRatio > this.memoryThreshold;
    }
  }

  // Estimer l'utilisation mémoire
  estimateMemoryUsage() {
    let total = 0;
    
    // Estimation basique pour les textures
    for (const texture of this.textures.values()) {
      if (texture.image) {
        const size = texture.image.width * texture.image.height * 4; // RGBA
        total += size;
      }
    }
    
    return total;
  }

  // Optimiser pour les performances faibles
  enableLowMemoryMode() {
    this.isLowMemory = true;
    console.log('[MemoryManager] Mode faible mémoire activé');
    
    // Re-optimiser toutes les textures existantes
    for (const texture of this.textures.values()) {
      this.optimizeTexture(texture);
    }
    
    // Nettoyer immédiatement
    this.cleanup();
  }

  // Désactiver le mode faible mémoire
  disableLowMemoryMode() {
    this.isLowMemory = false;
    console.log('[MemoryManager] Mode faible mémoire désactivé');
  }

  // Nettoyer tout avant fermeture
  dispose() {
    console.log('[MemoryManager] Nettoyage complet');
    
    // Disposer de tous les objets
    for (const disposable of this.disposables) {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    }
    
    // Vider les caches
    this.textures.clear();
    this.geometries.clear();
    this.materials.clear();
    this.disposables.clear();
    
    // Forcer le garbage collection
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
    }
  }

  // Obtenir les statistiques mémoire
  getStats() {
    this.updateMemoryStats();
    return { ...this.memoryStats, isLowMemory: this.isLowMemory };
  }

  // Démarrer le nettoyage automatique
  startAutoCleanup() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }
}

// Instance globale
const memoryManager = new MemoryManager();

// Démarrer le nettoyage automatique
memoryManager.startAutoCleanup();

// Nettoyer au déchargement de la page
window.addEventListener('beforeunload', () => {
  memoryManager.dispose();
});

export default memoryManager; 
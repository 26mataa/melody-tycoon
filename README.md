# Melody Tycoon

Un jeu de gestion narratif : montez votre label de musique, signez des artistes, produisez des sons et traversez une histoire qui se souvient de vos choix.

🎮 **[Jouer en ligne](https://26mataa.github.io/melody-tycoon/)**

## À propos

Projet développé avec l'assistance de Claude (Anthropic), à des fins de test et d'expérimentation.

## Technique

HTML / CSS / JavaScript pur — aucune installation ni build nécessaire. Le jeu tourne entièrement dans le navigateur ; les parties sont sauvegardées localement (`localStorage`).

Pour lancer une copie locale :

```
git clone https://github.com/26mataa/melody-tycoon.git
cd melody-tycoon
```

Puis ouvrez `index.html` via un petit serveur local (par exemple `serve.ps1` sous Windows), les modules JS ne se chargent pas directement depuis le système de fichiers.

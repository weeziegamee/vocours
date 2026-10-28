# Vocourse

Liste d'épicerie à la voix pour les aînés. La personne aidée dicte sa liste ; son aidant
la reçoit par texto avec un lien Instacart, choisit le magasin, voit le prix et paie.

* **Appli** (iOS, Android) : Expo SDK 57 / React Native 0.86, français canadien et anglais
  canadien, dictée et voix du téléphone, accessible (AAA, 200 %, VoiceOver/TalkBack).
* **Serveur** : Node 24 sans dépendance d'exécution, SQLite chiffré, Instacart Developer
  Platform, textos Twilio, conforme à la Loi 25 (hébergement prévu au Québec).

| Pour… | Lire |
|---|---|
| Installer et essayer | [LANCEMENT.md](LANCEMENT.md) |
| Mettre en production | [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) |
| Comprendre le code | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Confidentialité | [docs/CONFIDENTIALITE.md](docs/CONFIDENTIALITE.md), [docs/PRIVACY.md](docs/PRIVACY.md), [docs/EFVP.md](docs/EFVP.md) |
| Fiches des boutiques | [docs/STORES.md](docs/STORES.md) |

```bash
./scripts/setup.sh     # installe tout et lance les 169 tests
```

# Edge Functions - Variables d'Environnement

Ce document liste toutes les variables d'environnement requises et optionnelles pour les edge functions.

## 🔧 Configuration

Les variables d'environnement pour les edge functions Supabase doivent être configurées via:
- **Dashboard Supabase**: Settings > Edge Functions > Secrets
- **CLI Supabase**: `supabase secrets set VARIABLE_NAME=value`

## 📋 Variables Requises

### Supabase
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### API Keys
```bash
# Anthropic Claude API (pour la génération de mémo)
ANTHROPIC_API_KEY=sk-ant-xxx

# Mistral OCR API (pour l'extraction de texte des PDFs)
MISTRAL_API_KEY=xxx

# Linkup API (pour les recherches web dans les mémos)
LINKUP_API_KEY=xxx

# Resend API (pour les alertes email aux admins)
RESEND_API_KEY=re_xxx
```

### Twilio WhatsApp (pour l'intégration WhatsApp)
```bash
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

## 📋 Variables Optionnelles

### Email Admin
```bash
# Email pour recevoir les alertes en cas d'erreur d'analyse
# Par défaut: benjamin@alboteam.com
ADMIN_EMAIL=your-email@domain.com
```

### Site URL
```bash
# URL du site pour les liens dans les messages WhatsApp
# Par défaut: https://your-app.com
SITE_URL=https://your-domain.com
```

## 🔐 Sécurité

- ⚠️ **Ne jamais committer les clés API dans Git**
- ✅ Toujours utiliser le système de secrets de Supabase
- ✅ Renouveler régulièrement les clés API sensibles
- ✅ Limiter les permissions des clés au strict nécessaire

## 📝 Commandes Utiles

### Lister tous les secrets
```bash
supabase secrets list
```

### Définir un secret
```bash
supabase secrets set ADMIN_EMAIL=benjamin@alboteam.com
```

### Supprimer un secret
```bash
supabase secrets unset ADMIN_EMAIL
```

## 🔄 Déploiement

Après avoir modifié les secrets:
```bash
# Redéployer toutes les fonctions
supabase functions deploy

# Ou redéployer une fonction spécifique
supabase functions deploy analyze-deck-orchestrator
```

## 📚 Références

- [Supabase Edge Functions Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Anthropic API Keys](https://console.anthropic.com/)
- [Mistral AI API](https://console.mistral.ai/)
- [Linkup API](https://linkup.so/)
- [Resend API](https://resend.com/)
- [Twilio Console](https://console.twilio.com/)

#!/usr/bin/env bash
set -euo pipefail
umask 077
PROJECT="nexa-drive-connect"
REGION="southamerica-east1"
SERVICE="nexa-oauth-relay"
ACCOUNT="nexa-relay-runtime"
SECRET_CLIENT="nexa-relay-client-secret"
SECRET_KEY="nexa-relay-access-key"
printf '\nNEXA OAuth Relay — instalação única no Google Cloud\n'
printf 'Projeto: %s | Região: %s\n' "$PROJECT" "$REGION"
echo "ATENÇÃO: Cloud Run, Cloud Build e Secret Manager podem gerar cobranças."
read -r -p "Digite INSTALAR para confirmar criação e possíveis custos: " CONFIRM
[[ "$CONFIRM" == "INSTALAR" ]] || { echo "Cancelado."; exit 1; }
gcloud config set project "$PROJECT" >/dev/null
if gcloud run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1; then
 echo "O serviço já existe. Não substituirei o Relay nem trocarei chaves automaticamente."
 exit 1
fi
read -r -p "Cole o Client ID do cliente OAuth Web (não é secreto): " CLIENT_ID
if [[ ! "$CLIENT_ID" =~ ^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$ ]]; then
 echo "Client ID inválido";exit 1
fi
read -r -s -p "Cole o Client Secret do mesmo cliente OAuth Web (entrada invisível): " CLIENT_SECRET
printf '\n'
if [[ ! "$CLIENT_SECRET" =~ ^.{8,}$ ]];then echo "Client Secret inválido";exit 1;fi
RELAY_KEY="$(openssl rand -hex 32)"
echo "Habilitando APIs do próprio projeto..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com --quiet
if gcloud secrets describe "$SECRET_CLIENT" >/dev/null 2>&1 || gcloud secrets describe "$SECRET_KEY" >/dev/null 2>&1; then
 echo "Há segredos existentes com o mesmo nome. Interrompido para evitar mudanças acidentais.";exit 1
fi
gcloud secrets create "$SECRET_CLIENT" --replication-policy=automatic --quiet
printf '%s' "$CLIENT_SECRET" | gcloud secrets versions add "$SECRET_CLIENT" --data-file=- --quiet
unset CLIENT_SECRET
gcloud secrets create "$SECRET_KEY" --replication-policy=automatic --quiet
printf '%s' "$RELAY_KEY" | gcloud secrets versions add "$SECRET_KEY" --data-file=- --quiet
if ! gcloud iam service-accounts describe "$ACCOUNT@$PROJECT.iam.gserviceaccount.com" >/dev/null 2>&1;then
 gcloud iam service-accounts create "$ACCOUNT" --display-name="NEXA OAuth Relay runtime" --quiet
fi
for secret in "$SECRET_CLIENT" "$SECRET_KEY";do
 gcloud secrets add-iam-policy-binding "$secret" --member="serviceAccount:$ACCOUNT@$PROJECT.iam.gserviceaccount.com" \
   --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
done
gcloud run deploy "$SERVICE" --source=. --region="$REGION" --platform=managed \
 --allow-unauthenticated --service-account="$ACCOUNT@$PROJECT.iam.gserviceaccount.com" \
 --memory=256Mi --cpu=1 --max-instances=1 --concurrency=10 --timeout=20 \
 --set-env-vars="OAUTH_CLIENT_ID=$CLIENT_ID" \
 --set-secrets="OAUTH_CLIENT_SECRET=$SECRET_CLIENT:1,RELAY_ACCESS_KEY=$SECRET_KEY:1" \
 --quiet
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
[[ "$URL" == https://*.run.app ]] || { echo "Não foi possível conferir o HTTPS do Cloud Run.";exit 1; }
curl -fsS "$URL/health"
printf '\n\n====== DADOS PARA O OBSIDIAN ======\n'
printf 'Endereço do Relay: %s\n' "$URL"
printf 'Chave privada do Relay: %s\n' "$RELAY_KEY"
printf 'Client ID: %s\n' "$CLIENT_ID"
echo '==================================='
echo 'NÃO compartilhe capturas da chave nem do Client Secret.'
unset RELAY_KEY

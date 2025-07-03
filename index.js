require('dotenv').config();
const express = require('express');
const docusign = require('docusign-esign');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Crash handlers
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// Auth middleware
app.use((req, res, next) => {
  const authHeader = req.headers['x-agent-auth'];
  if (authHeader !== process.env.MY_AGENT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health route
app.get('/', (req, res) => {
  res.send('✅ DocuSign Agent is running');
});

app.post('/send-offer', async (req, res) => {
  const {
    signerName,
    signerEmail,
    CandidateRole,
    StartDate,
    EndDate,
    PositionOfGuide
  } = req.body;

  const {
    dsJWTClientId,
    dsOauthServer,
    impersonatedUserGuid,
    PRIVATE_KEY,
    TEMPLATE_ID
  } = process.env;


  console.log("✅ Printing loaded env vars:");
  console.log({
    dsJWTClientId,
    dsOauthServer,
    impersonatedUserGuid,
    TEMPLATE_ID,
    PRIVATE_KEY
  });
  console.log('🔐 Attempting to read private key from:', PRIVATE_KEY);

  const privateKey = process.env.PRIVATE_KEY;

if (!privateKey || !privateKey.includes('BEGIN PRIVATE KEY')) {
  console.error('❌ PRIVATE_KEY is missing or malformed in environment variables');
  process.exit(1);
}

  try {
    const apiClient = new docusign.ApiClient();
    apiClient.setOAuthBasePath(dsOauthServer.replace(/^https?:\/\//, ''));

    const results = await apiClient.requestJWTUserToken(
      dsJWTClientId,
      impersonatedUserGuid,
      ['signature'],
      privateKey,
      3600
    );

    const accessToken = results.body.access_token;
    const userInfo = await apiClient.getUserInfo(accessToken);
    const basePath = `${userInfo.accounts[0].baseUri}/restapi`;
    const accountId = userInfo.accounts[0].accountId;

    apiClient.setBasePath(basePath);
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    const envelopeDefinition = {
      templateId: TEMPLATE_ID,
      templateRoles: [
        {
          email: signerEmail,
          name: signerName,
          roleName: 'Candidate',
          tabs: {
            textTabs: [
              { tabLabel: 'CandidateName', value: signerName },
              { tabLabel: 'CandidateRole', value: CandidateRole },
              { tabLabel: 'StartDate', value: StartDate },
              { tabLabel: 'EndDate', value: EndDate },
              { tabLabel: 'PositionOfGuide', value: PositionOfGuide }
            ]
          }
        }
      ],
      status: 'sent'
    };

    const envelopeSummary = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition
    });

    res.status(200).json({
      message: 'Envelope sent',
      envelopeId: envelopeSummary.envelopeId
    });

  } catch (err) {
    console.error('❌ Error sending envelope:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 DocuSign Agent is running on port ${PORT}`);
});

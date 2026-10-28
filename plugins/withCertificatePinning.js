/**
 * Épinglage du certificat du serveur Vocourse (facultatif, recommandé une fois
 * l'hébergement stable). Activé seulement si VOCOURSE_TLS_HOST et au moins DEUX empreintes
 * VOCOURSE_TLS_PINS sont fournies (une principale + une de secours), sinon l'appli
 * pourrait se retrouver coupée du serveur au prochain renouvellement du certificat.
 *
 * Épingler l'autorité de certification (CA intermédiaire ou racine), pas le certificat
 * du serveur : il change tous les 60 à 90 jours. Empreinte SPKI SHA-256 en base64 :
 *   openssl x509 -in ca.pem -pubkey -noout | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary | openssl enc -base64
 *
 * iOS : NSPinnedDomains (App Transport Security). Android : network_security_config.xml.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const xmlEscape = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

const withCertificatePinning = (config, { host, pins, expiration }) => {
  if (!host || !Array.isArray(pins) || pins.length < 2) return config;
  // Après l'échéance, Android cesse d'appliquer l'épinglage (filet de sécurité) : 1 an par défaut.
  const until = expiration ?? new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  config = withInfoPlist(config, (c) => {
    const ats = c.modResults.NSAppTransportSecurity ?? {};
    c.modResults.NSAppTransportSecurity = {
      ...ats,
      NSPinnedDomains: {
        ...(ats.NSPinnedDomains ?? {}),
        [host]: { NSIncludesSubdomains: false, NSPinnedCAIdentities: pins.map((p) => ({ 'SPKI-SHA256-BASE64': p })) },
      },
    };
    return c;
  });

  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      const pinXml = pins.map((p) => `      <pin digest="SHA-256">${xmlEscape(p)}</pin>`).join('\n');
      fs.writeFileSync(
        path.join(dir, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">${xmlEscape(host)}</domain>
    <pin-set expiration="${until}">
${pinXml}
    </pin-set>
  </domain-config>
</network-security-config>
`,
      );
      return c;
    },
  ]);

  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return c;
  });

  return config;
};

module.exports = withCertificatePinning;

export function escHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FOOTER_TEXT = {
  en: "You're receiving this email because you're a member of OBIGBO.",
  ig: "Ị na-enweta email a n'ihi na ị bụ onye otu OBIGBO.",
};

export function renderBase(content: string, lang: "en" | "ig"): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OBIGBO</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe5;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#D4631F;padding:24px 32px;border-radius:8px 8px 0 0">
            <span style="color:#fff;font-size:24px;font-weight:700;letter-spacing:1px">OBIGBO</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px;color:#1a1a1a;font-size:16px;line-height:1.6">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F5F0EB;padding:20px 32px;border-radius:0 0 8px 8px;font-size:13px;color:#666;line-height:1.5">
            <p style="margin:0 0 8px">${FOOTER_TEXT[lang]}</p>
            <p style="margin:0">© ${year} OBIGBO · <a href="#" style="color:#D4631F;text-decoration:none">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

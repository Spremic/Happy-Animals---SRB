const nodemailer = require("nodemailer");

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendOrderNotificationEmail(order) {
  const providerMail = process.env.provider_mail;
  const providerPass = process.env.provider_pass;
  const ownerMail = process.env.owner_mail || providerMail;

  if (!providerMail || !providerPass) {
    return { success: false, message: "Email provajder nije konfigurisan." };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: providerMail,
        pass: providerPass,
      },
    });

    const itemsHtml = (order.items || [])
      .map((item) => {
        const title = escapeHtml(item.title || "Artikal");
        const code = escapeHtml(item.code || "-");
        const size = escapeHtml(item.size || "-");
        const color = escapeHtml(item.color || "-");
        const qty = parseInt(item.quantity) || 1;
        const price = (Number(item.price) || 0).toLocaleString("sr-RS");
        const total = (Number(item.total) || 0).toLocaleString("sr-RS");

        return `
        <tr>
          <td style="padding: 12px 14px; border-bottom: 1px solid #ebd9df; vertical-align: top;">
            <div style="font-weight: 700; font-size: 14px; color: #2c2527; line-height: 1.35; margin-bottom: 4px;">
              ${title}
            </div>
            <div style="font-size: 12px; color: #756a6e; line-height: 1.4;">
              <span style="display: inline-block; margin-right: 8px;">Šifra: <strong style="color: #4a4043;">${code}</strong></span>
              <span style="display: inline-block; background-color: #fdf2f5; color: #7c2e4b; padding: 1px 7px; border-radius: 4px; font-weight: 600; font-size: 11px; border: 1px solid #ebd9df; margin-right: 4px;">Vel: ${size}</span>
              <span style="display: inline-block; background-color: #f6f4f5; color: #4a4043; padding: 1px 7px; border-radius: 4px; font-weight: 600; font-size: 11px; border: 1px solid #e5dedf;">Boja: ${color}</span>
            </div>
          </td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #ebd9df; text-align: center; vertical-align: top; font-size: 13px; font-weight: 600; color: #2c2527;">
            <span style="display: inline-block; background: #faf4f6; border-radius: 12px; padding: 2px 9px; border: 1px solid #ebd9df;">
              ${qty} kom
            </span>
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid #ebd9df; text-align: right; vertical-align: top; font-size: 13px; color: #4a4043; white-space: nowrap;">
            ${price} RSD
          </td>
          <td style="padding: 12px 14px; border-bottom: 1px solid #ebd9df; text-align: right; vertical-align: top; font-size: 14px; font-weight: 700; color: #7c2e4b; white-space: nowrap;">
            ${total} RSD
          </td>
        </tr>
      `;
      })
      .join("");

    const discountAmount = Number(order.discountAmount) || 0;
    const discountHtml = discountAmount > 0
      ? `
        <tr>
          <td colspan="3" style="padding: 8px 14px; text-align: right; color: #27ae60; font-size: 13px; font-weight: 600;">
            Ostvareni popust (${escapeHtml(order.couponCode || "Kupon")}):
          </td>
          <td style="padding: 8px 14px; text-align: right; color: #27ae60; font-weight: 700; font-size: 14px; white-space: nowrap;">
            -${discountAmount.toLocaleString("sr-RS")} RSD
          </td>
        </tr>
      `
      : "";

    const shippingAmount = Number(order.shippingAmount);
    const shippingText = shippingAmount === 0 
      ? '<span style="color: #27ae60; font-weight: 700;">Besplatna dostava</span>' 
      : `${(shippingAmount || 350).toLocaleString("sr-RS")} RSD`;

    const cleanOrderNumber = escapeHtml(order.orderNumber || order._id);
    const firstName = escapeHtml(order.firstName || "");
    const lastName = escapeHtml(order.lastName || "");
    const fullName = `${firstName} ${lastName}`.trim() || "Kupac";
    const phone = escapeHtml(order.phoneNumber || "-");
    const email = escapeHtml(order.email || "-");
    const street = escapeHtml(order.streetName || "");
    const house = escapeHtml(order.houseNumber || "");
    const apt = order.apartment ? `, stan ${escapeHtml(order.apartment)}` : "";
    const postal = escapeHtml(order.postalCode || "");
    const city = escapeHtml(order.city || "");
    const address = `${street} ${house}${apt}, ${postal} ${city}`;
    const paymentMethodText = order.paymentMethod === "pouzecem" ? "Plaćanje pouzećem (gotovinom kuriru)" : escapeHtml(order.paymentMethod || "Pouzećem");
    const totalAmountStr = (Number(order.totalAmount) || 0).toLocaleString("sr-RS");

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="sr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Potvrda porudžbine #${cleanOrderNumber}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f7f3f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #2c2527;">
        
        <!-- GLAVNI KONTEJNER -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f3f5; padding: 24px 12px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 620px; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #ebd9df; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
                
                <!-- ZAGLAVLJE SA GRADIENTOM -->
                <tr>
                  <td style="background: linear-gradient(135deg, #7c2e4b 0%, #2c2527 100%); padding: 32px 24px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2.5px; font-weight: 700; color: #f4d5de; margin-bottom: 6px;">
                      HAPPY ANIMALS PET SHOP
                    </div>
                    <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em;">
                      Potvrda porudžbine
                    </h1>
                    <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 20px; padding: 5px 16px; font-size: 13px; font-weight: 600; color: #ffffff; letter-spacing: 0.5px;">
                      Broj: #${cleanOrderNumber}
                    </div>
                  </td>
                </tr>

                <!-- POZDRAV I UVOD -->
                <tr>
                  <td style="padding: 24px 24px 16px;">
                    <p style="margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #7c2e4b;">
                      Poštovani/a ${fullName},
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4a4043;">
                      Hvala Vam na ukazanom poverenju! Vaša porudžbina je uspešno primljena i prosleđena u sistem na obradu. U nastavku možete proveriti detaljan pregled narudžbine i podatke za isporuku.
                    </p>
                  </td>
                </tr>

                <!-- PODACI O KUPCU I ADRESA DOSTAVE (2 KARTICE) -->
                <tr>
                  <td style="padding: 8px 24px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Kartica 1: Kupac -->
                        <td width="48%" style="background-color: #faf7f8; border: 1px solid #ebd9df; border-radius: 10px; padding: 14px; vertical-align: top;">
                          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #7c2e4b; margin-bottom: 8px;">
                            Podaci o kupcu
                          </div>
                          <div style="font-size: 13px; line-height: 1.5; color: #2c2527;">
                            <strong>${fullName}</strong><br>
                            <span style="color: #6d6367;">Tel:</span> ${phone}<br>
                            <span style="color: #6d6367;">Email:</span> ${email}
                          </div>
                        </td>

                        <td width="4%">&nbsp;</td>

                        <!-- Kartica 2: Adresa -->
                        <td width="48%" style="background-color: #faf7f8; border: 1px solid #ebd9df; border-radius: 10px; padding: 14px; vertical-align: top;">
                          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #7c2e4b; margin-bottom: 8px;">
                            Adresa za isporuku
                          </div>
                          <div style="font-size: 13px; line-height: 1.5; color: #2c2527;">
                            <strong>${address}</strong><br>
                            <span style="color: #6d6367;">Dostava:</span> Kurirska služba<br>
                            <span style="color: #6d6367;">Plaćanje:</span> Pouzećem
                          </div>
                        </td>
                      </tr>
                    </table>

                    ${order.note ? `
                      <div style="margin-top: 12px; background-color: #fdfaf6; border-left: 3px solid #e67e22; padding: 8px 12px; font-size: 12px; color: #755530; border-radius: 0 6px 6px 0;">
                        <strong>Napomena uz porudžbinu:</strong> ${escapeHtml(order.note)}
                      </div>
                    ` : ""}
                  </td>
                </tr>

                <!-- TABELA SA ARTIKLIMA -->
                <tr>
                  <td style="padding: 0 24px 20px;">
                    <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #7c2e4b; margin-bottom: 10px;">
                      Naručeni artikli
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; border: 1px solid #ebd9df; border-radius: 8px; overflow: hidden;">
                      <thead>
                        <tr style="background-color: #faf4f6; color: #7c2e4b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                          <th style="padding: 10px 14px; text-align: left; font-weight: 700; border-bottom: 1px solid #ebd9df;">Artikal</th>
                          <th style="padding: 10px 10px; text-align: center; font-weight: 700; border-bottom: 1px solid #ebd9df; width: 70px;">Kol.</th>
                          <th style="padding: 10px 14px; text-align: right; font-weight: 700; border-bottom: 1px solid #ebd9df; width: 90px;">Cena</th>
                          <th style="padding: 10px 14px; text-align: right; font-weight: 700; border-bottom: 1px solid #ebd9df; width: 90px;">Ukupno</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsHtml}
                      </tbody>
                      <tfoot>
                        ${discountHtml}
                        <tr>
                          <td colspan="3" style="padding: 8px 14px; text-align: right; color: #6d6367; font-size: 13px;">
                            Troškovi dostave:
                          </td>
                          <td style="padding: 8px 14px; text-align: right; font-size: 13px; color: #2c2527; white-space: nowrap;">
                            ${shippingText}
                          </td>
                        </tr>
                        <tr style="background-color: #fdf8fa;">
                          <td colspan="3" style="padding: 14px 14px; text-align: right; font-weight: 700; font-size: 14px; color: #2c2527; border-top: 2px solid #7c2e4b;">
                            UKUPNO ZA PLAĆANJE:
                          </td>
                          <td style="padding: 14px 14px; text-align: right; font-weight: 800; font-size: 18px; color: #7c2e4b; border-top: 2px solid #7c2e4b; white-space: nowrap;">
                            ${totalAmountStr} RSD
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>

                <!-- INFORMACIJA O ISPORUCI BANER -->
                <tr>
                  <td style="padding: 0 24px 24px;">
                    <div style="background-color: #faf5f7; border: 1px dashed #7c2e4b; border-radius: 8px; padding: 14px 16px; font-size: 13px; line-height: 1.5; color: #4a4043;">
                      <strong style="color: #7c2e4b;">Informacija o isporuci:</strong>
                      Pošiljka će biti poslata kurirskom službom u roku od 1–3 radna dana. Kurir će Vas pre same isporuke kontaktirati putem telefona. Plaćanje se vrši u gotovini kuriru pri preuzimanju.
                    </div>
                  </td>
                </tr>

                <!-- DUGME ZA POVRATAK U PRODAVNICU -->
                <tr>
                  <td align="center" style="padding: 0 24px 28px;">
                    <a href="https://happyanimals.rs" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #009900 0%, #006600 100%); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">
                      Posetite Happy Animals
                    </a>
                  </td>
                </tr>

                <!-- PODNOŽJE (FOOTER) -->
                <tr>
                  <td style="background-color: #faf4f6; border-top: 1px solid #ebd9df; padding: 20px 24px; text-align: center; font-size: 12px; color: #756a6e; line-height: 1.5;">
                    <div>Imate pitanje u vezi sa porudžbinom? Pišite nam na <a href="mailto:${ownerMail}" style="color: #009900; text-decoration: underline; font-weight: 600;">${ownerMail}</a></div>
                    <div style="margin-top: 6px; font-size: 11px; color: #9c9296;">
                      © ${new Date().getFullYear()} Happy Animals. Sva prava zadržana.
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>

      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"Happy Animals" <${providerMail}>`,
      to: [ownerMail, order.email],
      subject: `Nova porudžbina #${order.orderNumber || order._id} - Happy Animals`,
      html: emailHtml,
    });

    return { success: true };
  } catch (err) {
    console.error("Greška pri slanju emaila za porudžbinu:", err.message);
    return { success: false, error: err.message };
  }
}

async function sendNewsletterCouponEmail(email, couponCode = "HA10") {
  const providerMail = process.env.provider_mail;
  const providerPass = process.env.provider_pass;

  if (!providerMail || !providerPass) {
    return { success: false, message: "Email provajder nije konfigurisan." };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: providerMail,
        pass: providerPass,
      },
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="sr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dobrodošli u Happy Animals</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f7f3f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #2c2527;">
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f3f5; padding: 24px 12px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #ebd9df; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
                
                <!-- ZAGLAVLJE -->
                <tr>
                  <td style="background: linear-gradient(135deg, #009900 0%, #006600 100%); padding: 32px 20px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2.5px; font-weight: 700; color: #f4d5de; margin-bottom: 6px;">
                      HAPPY ANIMALS PET SHOP
                    </div>
                    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em;">
                      Dobrodošli u naš klub!
                    </h1>
                    <p style="margin: 0; font-size: 14px; color: #fdf2f5; opacity: 0.95;">
                      Vaš poklon dobrodošlice od 10% popusta je spreman
                    </p>
                  </td>
                </tr>

                <!-- TELO PORUKE -->
                <tr>
                  <td style="padding: 30px 24px; text-align: center;">
                    <p style="font-size: 15px; line-height: 1.6; color: #4a4043; margin: 0 0 20px;">
                      Hvala Vam što ste se prijavili na naš newsletter! Kao znak pažnje i dobrodošlice, pripremili smo za Vas promo kod za <strong>10% popusta</strong> na Vašu sledeću porudžbinu.
                    </p>

                    <!-- KUPON KARTICA -->
                    <div style="margin: 20px auto 25px; padding: 20px 28px; background-color: #fdf8fa; border: 2px dashed #7c2e4b; border-radius: 12px; display: inline-block;">
                      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #756a6e; font-weight: 700; margin-bottom: 6px;">
                        Vaš promotivni kod:
                      </div>
                      <div style="font-size: 30px; font-weight: 800; letter-spacing: 4px; color: #7c2e4b;">
                        ${couponCode}
                      </div>
                      <div style="font-size: 12px; color: #27ae60; font-weight: 600; margin-top: 4px;">
                        ✓ 10% popusta na kompletnu korpu
                      </div>
                    </div>

                    <p style="font-size: 13px; color: #6d6367; margin: 0 0 25px; line-height: 1.5;">
                      Unesite ovaj kod na stranici za naručivanje da biste ostvarili popust.<br>
                      <em>Podsećamo Vas da je dostava <strong>besplatna</strong> za sve porudžbine od 3.000 RSD i više!</em>
                    </p>

                    <!-- CTA DUGME -->
                    <div>
                      <a href="https://happyanimals.rs/all-products" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #009900 0%, #006600 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">
                        Istražite našu ponudu
                      </a>
                    </div>
                  </td>
                </tr>

                <!-- PODNOŽJE -->
                <tr>
                  <td style="background-color: #faf4f6; border-top: 1px solid #ebd9df; padding: 18px 24px; text-align: center; font-size: 12px; color: #756a6e;">
                    © ${new Date().getFullYear()} Happy Animals. Sva prava zadržana.
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>

      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"Happy Animals" <${providerMail}>`,
      to: email,
      subject: `Vaš kupon kod za 10% popusta u Happy Animals! (${couponCode})`,
      html: emailHtml,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("Greška pri slanju newsletter email-a:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendOrderNotificationEmail,
  sendNewsletterCouponEmail,
};

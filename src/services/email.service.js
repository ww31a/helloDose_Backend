import sgMail from "@sendgrid/mail";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log("SendGrid initialized with API Key");
} else {
  console.warn("SENDGRID_API_KEY is missing in .env");
}

/**
 * Send OTP email to user
 */
export const sendOtpEmail = async (email, otp, firstName) => {
  if (!process.env.SENDGRID_API_KEY) {
    console.error("Cannot send email: SENDGRID_API_KEY is missing");
    return;
  }

  try {
    const templatePath = path.join(__dirname, "../templates/emails/otp.ejs");
    console.log(`Rendering email template from: ${templatePath}`);
    
    const html = await ejs.renderFile(templatePath, { otp, firstName });

    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!fromEmail) {
      console.error("Cannot send email: SENDGRID_FROM_EMAIL is missing");
      return;
    }

    const msg = {
      to: email,
      from: {
        email: fromEmail,
        name: process.env.SENDGRID_FROM_NAME || "Hello Dose",
      },
      subject: `${otp} is your Hello Dose verification code`,
      html,
    };

    console.log(`Attempting to send OTP email to ${email} from ${fromEmail}...`);
    await sgMail.send(msg);
    console.log(`SUCCESS: OTP email sent to ${email}`);
  } catch (error) {
    console.error("FAILED: SendGrid email error:");
    if (error.response) {
      console.error(JSON.stringify(error.response.body, null, 2));
    } else {
      console.error(error.message);
    }
  }
};

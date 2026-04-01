import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
export const RESEND_FROM_EMAIL = "orders@havnhq.com";

export default resend;

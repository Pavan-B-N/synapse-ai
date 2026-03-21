export interface IEmailService {
  sendOTP(email: string, otp: string, purpose: 'registration' | 'login'): Promise<void>;
}

import { IEmailService } from './IEmailService';

class MockEmailService implements IEmailService {
  async sendOTP(email: string, otp: string, purpose: 'registration' | 'login'): Promise<void> {
    console.log(`[OTP] ${purpose} | ${email} | ${otp}`);
  }
}

export default MockEmailService;

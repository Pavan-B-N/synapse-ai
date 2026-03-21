import { IEmailService } from './IEmailService';
import MockEmailService from './MockEmailService';

export const emailService: IEmailService = new MockEmailService();

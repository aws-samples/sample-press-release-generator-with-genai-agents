/**
 * Email Composer Service
 * Composes complete, professional emails from pitch JSON data
 */

class EmailComposer {
    constructor() {
        this.defaultSender = {
            name: 'Example Company Market Intelligence',
            email: 'press@example.com',
            phone: '1-844-759-7732'
        };
    }

    /**
     * Compose a complete email from pitch data
     * @param {Object} pitchData - The pitch JSON data
     * @param {Object} options - Email composition options
     * @returns {Object} Complete email with HTML and plain text versions
     */
    composeEmail(pitchData, options = {}) {
        try {
            const { pitchEmail, market } = pitchData;
            
            if (!pitchEmail) {
                throw new Error('No pitch email data found');
            }

            const { hook, bullets, interviewOffer } = pitchEmail;
            
            // Generate subject line from hook
            const subject = this.generateSubject(hook, market);
            
            // Compose email body
            const htmlBody = this.composeHtmlBody(hook, bullets, interviewOffer, market, options);
            const plainTextBody = this.composePlainTextBody(hook, bullets, interviewOffer, market, options);
            
            return {
                subject,
                html: htmlBody,
                text: plainTextBody,
                metadata: {
                    market,
                    generatedAt: new Date().toISOString(),
                    bulletCount: bullets?.length || 0,
                    hasInterviewOffer: !!interviewOffer
                }
            };
            
        } catch (error) {
            console.error('Error composing email:', error);
            throw new Error(`Failed to compose email: ${error.message}`);
        }
    }

    /**
     * Generate email subject line from hook
     */
    generateSubject(hook, market) {
        if (!hook) return `Market Update: ${market}`;
        
        // Clean up hook for subject line
        let subject = hook.replace(/^#\s*/, ''); // Remove markdown header
        
        // Ensure it's not too long for email subject
        if (subject.length > 78) {
            subject = subject.substring(0, 75) + '...';
        }
        
        return subject;
    }

    /**
     * Compose HTML email body
     */
    composeHtmlBody(hook, bullets, interviewOffer, market, options) {
        const recipient = options.recipient || '[Recipient Name]';
        const senderName = options.senderName || this.defaultSender.name;
        
        let htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Market Update</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #0066cc; padding-bottom: 15px; margin-bottom: 20px; }
        .hook { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 20px; }
        .bullets { margin: 20px 0; }
        .bullet { margin: 10px 0; padding: 8px 0; border-left: 3px solid #0066cc; padding-left: 15px; }
        .interview-offer { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .contact-info { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 14px; color: #666; }
        .signature { margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h2 style="margin: 0; color: #0066cc;">Market Intelligence Update</h2>
    </div>
    
    <p>Dear ${recipient},</p>
    
    <div class="hook">
        ${this.cleanHookForEmail(hook)}
    </div>
    
    <p>We wanted to share the latest market insights for ${market}:</p>
    
    <div class="bullets">
        <h3 style="color: #0066cc;">Key "Market Highlights":</h3>`;

        // Add bullets
        if (bullets && Array.isArray(bullets)) {
            bullets.forEach(bullet => {
                htmlBody += `
        <div class="bullet">
            • ${bullet.content || bullet}
        </div>`;
            });
        }

        htmlBody += `
    </div>`;

        // Add interview offer if available
        if (interviewOffer && interviewOffer.message) {
            htmlBody += `
    <div class="interview-offer">
        <h3 style="color: #0066cc; margin-top: 0;">Expert Commentary Available</h3>
        <p>${interviewOffer.message}</p>
        ${interviewOffer.contact ? `<p><strong>Media Contact:</strong> ${interviewOffer.contact}</p>` : ''}
    </div>`;
        }

        htmlBody += `
    <div class="signature">
        <p>Best regards,</p>
        <p><strong>${senderName}</strong></p>
    </div>
    
    <div class="contact-info">
        <p><strong>Contact Information:</strong><br>
        Email: ${this.defaultSender.email}<br>
        Phone: ${this.defaultSender.phone}</p>
        
        <p><em>This market intelligence update is provided by Example Company's research team. 
        For more information about our market analysis and data methodology, please contact us.</em></p>
    </div>
</body>
</html>`;

        return htmlBody;
    }

    /**
     * Compose plain text email body
     */
    composePlainTextBody(hook, bullets, interviewOffer, market, options) {
        const recipient = options.recipient || '[Recipient Name]';
        const senderName = options.senderName || this.defaultSender.name;
        
        let textBody = `MARKET INTELLIGENCE UPDATE\n`;
        textBody += `${'='.repeat(50)}\n\n`;
        
        textBody += `Dear ${recipient},\n\n`;
        
        textBody += `${this.cleanHookForEmail(hook)}\n\n`;
        
        textBody += `We wanted to share the latest market insights for ${market}:\n\n`;
        
        textBody += `KEY MARKET HIGHLIGHTS:\n`;
        textBody += `${'-'.repeat(25)}\n`;
        
        // Add bullets
        if (bullets && Array.isArray(bullets)) {
            bullets.forEach(bullet => {
                textBody += `• ${bullet.content || bullet}\n`;
            });
        }
        
        textBody += `\n`;
        
        // Add interview offer if available
        if (interviewOffer && interviewOffer.message) {
            textBody += `EXPERT COMMENTARY AVAILABLE:\n`;
            textBody += `${'-'.repeat(30)}\n`;
            textBody += `${interviewOffer.message}\n`;
            if (interviewOffer.contact) {
                textBody += `Media Contact: ${interviewOffer.contact}\n`;
            }
            textBody += `\n`;
        }
        
        textBody += `Best regards,\n`;
        textBody += `${senderName}\n\n`;
        
        textBody += `CONTACT INFORMATION:\n`;
        textBody += `${'-'.repeat(20)}\n`;
        textBody += `Email: ${this.defaultSender.email}\n`;
        textBody += `Phone: ${this.defaultSender.phone}\n\n`;
        
        textBody += `This market intelligence update is provided by Example Company's research team.\n`;
        textBody += `For more information about our market analysis and data methodology, please contact us.\n`;
        
        return textBody;
    }

    /**
     * Clean hook text for email display
     */
    cleanHookForEmail(hook) {
        if (!hook) return '';
        
        // Remove markdown formatting
        return hook
            .replace(/^#+\s*/, '') // Remove markdown headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
            .replace(/\*(.*?)\*/g, '$1') // Remove italic markdown
            .trim();
    }

    /**
     * Validate pitch data for email composition
     */
    validatePitchData(pitchData) {
        if (!pitchData) {
            throw new Error('Pitch data is required');
        }
        
        if (!pitchData.pitchEmail) {
            throw new Error('Pitch email data is missing');
        }
        
        const { hook, bullets } = pitchData.pitchEmail;
        
        if (!hook) {
            throw new Error('Email hook is missing');
        }
        
        if (!bullets || !Array.isArray(bullets) || bullets.length === 0) {
            throw new Error('Email bullets are missing or invalid');
        }
        
        return true;
    }
}

module.exports = { EmailComposer };
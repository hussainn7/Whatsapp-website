/**
 * Session Manager for WhatsApp Bot
 * 
 * This module helps maintain session persistence in environments
 * where filesystem writes may not be permanent (like GitHub deployments)
 * by leveraging environment variables as an additional storage layer.
 */

const fs = require('fs');
const path = require('path');

class SessionManager {
    /**
     * Initialize the session manager
     */
    constructor() {
        this.authDir = path.join(process.cwd(), '.wwebjs_auth');
        this.sessionFile = path.join(this.authDir, 'session.json');
        
        // Create auth directory if it doesn't exist
        if (!fs.existsSync(this.authDir)) {
            try {
                fs.mkdirSync(this.authDir, { recursive: true });
                console.log('SessionManager: Created auth directory');
            } catch (error) {
                console.error('SessionManager: Failed to create auth directory:', error);
            }
        }
        
        // Try to restore session from environment variable if available
        this.restoreSessionFromEnv();
    }
    
    /**
     * Restore session data from environment variable if available
     */
    restoreSessionFromEnv() {
        try {
            const envSession = process.env.WHATSAPP_SESSION;
            
            if (envSession) {
                try {
                    // Decode base64 if it's encoded
                    let sessionData;
                    if (envSession.startsWith('base64:')) {
                        // Remove the base64: prefix and decode
                        const base64Data = envSession.substring(7);
                        sessionData = Buffer.from(base64Data, 'base64').toString('utf8');
                    } else {
                        sessionData = envSession;
                    }
                    
                    // Parse the JSON data
                    const sessionObj = JSON.parse(sessionData);
                    
                    // Write to file
                    fs.writeFileSync(this.sessionFile, JSON.stringify(sessionObj, null, 2));
                    console.log('SessionManager: Restored session from environment variable');
                    
                    return true;
                } catch (parseError) {
                    console.error('SessionManager: Failed to parse environment session data:', parseError);
                }
            }
        } catch (error) {
            console.error('SessionManager: Error restoring session from environment:', error);
        }
        
        return false;
    }
    
    /**
     * Save the current session data to environment variable
     * This needs to be implemented in your deployment pipeline
     */
    saveSessionToEnv() {
        try {
            if (fs.existsSync(this.sessionFile)) {
                const sessionData = fs.readFileSync(this.sessionFile, 'utf8');
                
                // Convert to base64 to avoid escape issues
                const base64Data = Buffer.from(sessionData).toString('base64');
                
                // Make it VERY visible in the console
                console.log('\n\n');
                console.log('===============================================================');
                console.log('=================== WHATSAPP SESSION DATA ====================');
                console.log('===============================================================');
                console.log('Set this as WHATSAPP_SESSION environment variable in your deployment:');
                console.log(`base64:${base64Data}`);
                console.log('===============================================================');
                console.log('COPY THIS VALUE AND SAVE IT TO YOUR SETTINGS OR ENVIRONMENT VARIABLES');
                console.log('===============================================================\n\n');
                
                // Try to write the session data to an accessible file too
                try {
                    const sessionBackupFile = path.join(process.cwd(), 'whatsapp_session_backup.txt');
                    fs.writeFileSync(sessionBackupFile, `base64:${base64Data}`);
                    console.log(`Session data also saved to: ${sessionBackupFile}`);
                } catch (backupError) {
                    console.error('Could not save backup file:', backupError);
                }
                
                return base64Data;
            }
        } catch (error) {
            console.error('SessionManager: Error saving session to environment:', error);
        }
        
        return null;
    }
    
    /**
     * Check if a valid session exists
     */
    hasValidSession() {
        try {
            // First check if we have a local file
            if (fs.existsSync(this.sessionFile)) {
                const sessionData = fs.readFileSync(this.sessionFile, 'utf8');
                const sessionObj = JSON.parse(sessionData);
                
                // Basic validation - if it has WABrowserId it's likely valid
                if (sessionObj && sessionObj.WABrowserId) {
                    return true;
                }
            }
            
            // If no local file, check environment variable
            const envSession = process.env.WHATSAPP_SESSION;
            if (envSession) {
                // Try to restore it
                return this.restoreSessionFromEnv();
            }
        } catch (error) {
            console.error('SessionManager: Error checking session validity:', error);
        }
        
        return false;
    }
    
    /**
     * Export session data as a formatted string ready for environment variables
     */
    getSessionDataForEnv() {
        try {
            if (fs.existsSync(this.sessionFile)) {
                const sessionData = fs.readFileSync(this.sessionFile, 'utf8');
                const base64Data = Buffer.from(sessionData).toString('base64');
                return `base64:${base64Data}`;
            }
        } catch (error) {
            console.error('SessionManager: Error exporting session data:', error);
        }
        return null;
    }
}

module.exports = SessionManager; 

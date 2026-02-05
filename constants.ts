
// Web App URL from Google Apps Script Deployment
// export const GOOGLE_SCRIPT_URL: string = 'https://script.google.com/macros/s/AKfycbwHpejl1mMfSGedlgYbQk5-x0ToflCoRp89wY0Xpp4euecTsPPzIzIQi3mNcCae4NWO/exec';

// Secondary Web App URL for Read-Only Operations (Heartbeats)
// Deploy a 2nd script with the same code and paste URL here to enable Dual-Engine mode.
// export const GOOGLE_SCRIPT_READ_URL: string = 'https://script.google.com/macros/s/AKfycbwGWkr4NrLbs0rdc3TO9L2CpxT0uuCWEiKqH8Yjbx8COLPzrEiuTCaKGLjJBocUcdVYiQ/exec';

// 3-SERVICE ARCHITECHTURE
// Replace these with the actual deployment URLs after creating the scripts
export const SERVICES = {
    AUTH: 'https://script.google.com/macros/s/AKfycby7yfCEBr-qMc8nFuXWi-RUiJcZTbwD2oX1eboUZDRxlGFV6Mx4fokdRFVqOLTZm5tBWA/exec',   // Service A (Auth / Heartbeat)
    OPS: 'https://script.google.com/macros/s/AKfycbyvslJcVPegeetPWaJwRMNLHXJTWZ-bngp13vLrFV8z7RQD8MQRjRKmDAV6ACJf325SJw/exec',     // Service B (Jobs / Sync)
    MEDIA: 'https://script.google.com/macros/s/AKfycbzwIeE703JvKqOVI8s75rSHKwz6XHyRN8bdfi0MKVrUqkrzjyaUiaLfFjwzNOCybkS9/exec'  // Service C (PDF / Uploads)
};

// Map each Action to a Service
export const ACTION_MAP: Record<string, keyof typeof SERVICES> = {
    'LOGIN': 'AUTH',
    'CREW_LOGIN': 'AUTH',
    'SIGNUP': 'AUTH',
    'HEARTBEAT': 'AUTH',
    'SYNC_DOWN': 'AUTH',
    'SUBMIT_TRIAL': 'AUTH',
    'UPDATE_PASSWORD': 'AUTH',

    'SYNC_UP': 'OPS',
    'START_JOB': 'OPS',
    'COMPLETE_JOB': 'OPS',
    'MARK_JOB_PAID': 'OPS',
    'DELETE_ESTIMATE': 'OPS',
    'LOG_TIME': 'OPS',
    'SEND_MESSAGE': 'OPS',

    'SAVE_PDF': 'MEDIA',
    'UPLOAD_IMAGE': 'MEDIA',
    'CREATE_WORK_ORDER': 'MEDIA'
};
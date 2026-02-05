import { SERVICES, ACTION_MAP } from '../constants';
import { CalculatorState, EstimateRecord, UserSession } from '../types';

interface ApiResponse {
  status: 'success' | 'error';
  data?: any;
  message?: string;
}

/**
 * Helper to check if API is configured
 */
const isApiConfigured = () => {
  // Check if at least one service is configured or if using legacy
  return SERVICES.AUTH && !SERVICES.AUTH.includes('PLACEHOLDER');
};

/**
 * Helper for making robust fetch requests to GAS
 * Includes retry logic for cold starts and 3-Service Routing
 */
const apiRequest = async (payload: any, retries = 2): Promise<ApiResponse> => {
  if (!isApiConfigured()) {
    // Fallback: If user hasn't set up new URLs yet, this will fail.
    // Development mode check
    return { status: 'error', message: 'API Config Missing' };
  }

  // 3-Service Routing
  const action = payload.action;
  const serviceKey = ACTION_MAP[action] || 'OPS'; // Default to Ops if unknown
  const targetUrl = SERVICES[serviceKey];

  if (!targetUrl || targetUrl.includes('PLACEHOLDER')) {
    return { status: 'error', message: `Service URL for ${serviceKey} is not configured.` };
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        // strict text/plain to avoid CORS preflight (OPTIONS) which GAS fails on
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result: ApiResponse = await response.json();
    return result;
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`API Request Failed, retrying... (${retries} left)`);
      await new Promise(res => setTimeout(res, 1000)); // Wait 1s before retry
      return apiRequest(payload, retries - 1);
    }
    console.error("API Request Failed:", error);
    return { status: 'error', message: error.message || "Network request failed" };
  }
};

/**
 * Fetches the full application state from Google Sheets
 */
export const syncDown = async (spreadsheetId: string): Promise<Partial<CalculatorState> | null> => {
  const result = await apiRequest({ action: 'SYNC_DOWN', payload: { spreadsheetId } });

  if (result.status === 'success') {
    return result.data;
  } else {
    console.error("Sync Down Error:", result.message);
    return null;
  }
};

/**
 * Pushes the full application state to Google Sheets
 */
export const syncUp = async (state: CalculatorState, spreadsheetId: string): Promise<boolean> => {
  const result = await apiRequest({ action: 'SYNC_UP', payload: { state, spreadsheetId } });
  return result.status === 'success';
};

/**
 * Marks job as paid and triggers P&L calculation on backend
 */
export const markJobPaid = async (estimateId: string, spreadsheetId: string): Promise<{ success: boolean, estimate?: EstimateRecord }> => {
  const result = await apiRequest({ action: 'MARK_JOB_PAID', payload: { estimateId, spreadsheetId } });
  return { success: result.status === 'success', estimate: result.data?.estimate };
};

/**
 * Creates a standalone Work Order Google Sheet
 */
export const createWorkOrderSheet = async (estimateData: EstimateRecord, folderId: string | undefined, spreadsheetId: string): Promise<string | null> => {
  const result = await apiRequest({ action: 'CREATE_WORK_ORDER', payload: { estimateData, folderId, spreadsheetId } });
  if (result.status === 'success') return result.data.url;
  console.error("Create WO Error:", result.message);
  return null;
};

/**
 * Logs crew time to the Work Order Sheet
 */
export const logCrewTime = async (workOrderUrl: string, startTime: string, endTime: string | null, user: string): Promise<boolean> => {
  const result = await apiRequest({ action: 'LOG_TIME', payload: { workOrderUrl, startTime, endTime, user } });
  return result.status === 'success';
};

/**
 * Marks job as complete and syncs inventory
 */
export const completeJob = async (estimateId: string, actuals: any, spreadsheetId: string): Promise<boolean> => {
  const result = await apiRequest({ action: 'COMPLETE_JOB', payload: { estimateId, actuals, spreadsheetId } });
  return result.status === 'success';
};

/**
 * Deletes an estimate and potentially its associated files
 */
export const deleteEstimate = async (estimateId: string, spreadsheetId: string): Promise<boolean> => {
  const result = await apiRequest({ action: 'DELETE_ESTIMATE', payload: { estimateId, spreadsheetId } });
  return result.status === 'success';
};

/**
 * Uploads a PDF to Google Drive
 */
export const savePdfToDrive = async (fileName: string, base64Data: string, estimateId: string | undefined, spreadsheetId: string, folderId?: string) => {
  const result = await apiRequest({ action: 'SAVE_PDF', payload: { fileName, base64Data, estimateId, spreadsheetId, folderId } });
  return result.status === 'success' ? result.data.url : null;
};

/**
 * Authenticates user against backend
 */
export const loginUser = async (username: string, password: string): Promise<UserSession | null> => {
  const result = await apiRequest({ action: 'LOGIN', payload: { username, password } });
  if (result.status === 'success') return result.data;
  throw new Error(result.message || "Login failed");
};

/**
 * Authenticates crew member using PIN
 */
export const loginCrew = async (username: string, pin: string): Promise<UserSession | null> => {
  const result = await apiRequest({ action: 'CREW_LOGIN', payload: { username, pin } });
  if (result.status === 'success') return result.data;
  throw new Error(result.message || "Crew Login failed");
};

/**
 * Creates a new company account
 */
export const signupUser = async (username: string, password: string, companyName: string): Promise<UserSession | null> => {
  const result = await apiRequest({ action: 'SIGNUP', payload: { username, password, companyName } });
  if (result.status === 'success') return result.data;
  throw new Error(result.message || "Signup failed");
};

/**
 * Submits lead for trial access
 */
export const submitTrial = async (name: string, email: string, phone: string): Promise<boolean> => {
  const result = await apiRequest({ action: 'SUBMIT_TRIAL', payload: { name, email, phone } });
  return result.status === 'success';
};

/**
 * Notifies backend that a job has started (Live Spraying)
 */
export const startJob = async (estimateId: string, spreadsheetId: string): Promise<boolean> => {
  const result = await apiRequest({ action: 'START_JOB', payload: { estimateId, spreadsheetId } });
  return result.status === 'success';
};

// --- MESSAGING & HEARTBEAT ---

export const sendMessage = async (estimateId: string, content: string, sender: 'Admin' | 'Crew', spreadsheetId: string) => {
  return await apiRequest({ action: 'SEND_MESSAGE', payload: { estimateId, content, sender, spreadsheetId } });
};

export const heartbeat = async (spreadsheetId: string, lastSyncTimestamp?: string) => {
  return await apiRequest({ action: 'HEARTBEAT', payload: { spreadsheetId, lastSyncTimestamp } });
};

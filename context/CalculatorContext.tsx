
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import {
  CalculatorState,
  UserSession,
  CalculationMode,
  FoamType,
  EstimateRecord
} from '../types';

// --- INITIAL STATE ---
export const DEFAULT_STATE: CalculatorState = {
  mode: CalculationMode.BUILDING,
  length: 40,
  width: 30,
  wallHeight: 10,
  roofPitch: '4/12',
  includeGables: true,
  isMetalSurface: false,
  wallSettings: {
    type: FoamType.CLOSED_CELL,
    thickness: 1.0,
    wastePercentage: 5,
  },
  roofSettings: {
    type: FoamType.OPEN_CELL,
    thickness: 4.0,
    wastePercentage: 5,
  },
  yields: {
    openCell: 16000,
    closedCell: 4000,
    // Default Stroke Counts (Industry Average Placeholder)
    openCellStrokes: 6600,
    closedCellStrokes: 6600,
  },
  costs: {
    openCell: 2000,
    closedCell: 2600,
    laborRate: 85,
  },
  warehouse: {
    openCellSets: 0,
    closedCellSets: 0,
    items: []
  },
  equipment: [],
  showPricing: true,
  additionalAreas: [],
  inventory: [],
  jobEquipment: [],
  companyProfile: {
    companyName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    website: '',
    logoUrl: '',
    crewAccessPin: ''
  },
  customers: [],
  customerProfile: {
    id: '',
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    email: '',
    phone: '',
    notes: '',
    status: 'Active'
  },
  pricingMode: 'level_pricing',
  sqFtRates: {
    wall: 0,
    roof: 0
  },
  expenses: {
    manHours: 0,
    tripCharge: 0,
    fuelSurcharge: 0,
    other: {
      description: 'Misc',
      amount: 0
    }
  },
  savedEstimates: [],
  purchaseOrders: [],
  materialLogs: [],

  // NEW: Initial State
  messages: [],
  lifetimeUsage: {
    openCell: 0,
    closedCell: 0
  },

  scheduledDate: '',
  jobNotes: '',
  invoiceDate: '',
  invoiceNumber: '',
  paymentTerms: 'Due on Receipt'
};

// --- TYPES ---
type ViewType = 'calculator' | 'settings' | 'profile' | 'warehouse' | 'estimate' | 'dashboard' | 'customers' | 'customer_detail' | 'work_order_stage' | 'invoice_stage' | 'estimate_stage' | 'material_order' | 'material_report' | 'estimate_detail' | 'equipment_tracker' | 'chat';

interface UIState {
  view: ViewType;
  isLoading: boolean;
  isInitialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success' | 'pending';
  notification: { type: 'success' | 'error', message: string } | null;
  viewingCustomerId: string | null;
  editingEstimateId: string | null;
  hasTrialAccess: boolean;
  lastHeartbeat?: string; // NEW
}

interface ContextState {
  appData: CalculatorState;
  session: UserSession | null;
  ui: UIState;
}

type Action =
  | { type: 'SET_SESSION'; payload: UserSession | null }
  | { type: 'SET_TRIAL_ACCESS'; payload: boolean }
  | { type: 'LOAD_DATA'; payload: Partial<CalculatorState> }
  | { type: 'UPDATE_DATA'; payload: Partial<CalculatorState> }
  | { type: 'UPDATE_NESTED_DATA'; category: keyof CalculatorState; field: string; value: any }
  | { type: 'SET_VIEW'; payload: ViewType }
  | { type: 'SET_SYNC_STATUS'; payload: UIState['syncStatus'] }
  | { type: 'SET_NOTIFICATION'; payload: UIState['notification'] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_EDITING_ESTIMATE'; payload: string | null }
  | { type: 'SET_VIEWING_CUSTOMER'; payload: string | null }
  | { type: 'UPDATE_SAVED_ESTIMATE'; payload: EstimateRecord }
  | { type: 'RESET_CALCULATOR' }
  | { type: 'LOGOUT' }
  | { type: 'RFE_HEARTBEAT_UPDATE'; payload: { jobs: EstimateRecord[], messages: any[] } }; // NEW

// --- REDUCER ---
const initialState: ContextState = {
  appData: DEFAULT_STATE,
  session: null,
  ui: {
    view: 'dashboard',
    isLoading: true,
    isInitialized: false,
    syncStatus: 'idle',
    notification: null,
    viewingCustomerId: null,
    editingEstimateId: null,
    hasTrialAccess: false
  }
};

const calculatorReducer = (state: ContextState, action: Action): ContextState => {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, session: action.payload };
    case 'SET_TRIAL_ACCESS':
      return { ...state, ui: { ...state.ui, hasTrialAccess: action.payload } };
    case 'LOAD_DATA':
      return { ...state, appData: { ...state.appData, ...action.payload }, ui: { ...state.ui, isLoading: false } };
    case 'UPDATE_DATA':
      return { ...state, appData: { ...state.appData, ...action.payload } };
    case 'UPDATE_NESTED_DATA':
      return {
        ...state,
        appData: {
          ...state.appData,
          [action.category]: {
            ...(state.appData[action.category] as object),
            [action.field]: action.value
          }
        }
      };
    case 'SET_VIEW':
      return { ...state, ui: { ...state.ui, view: action.payload } };
    case 'SET_SYNC_STATUS':
      return { ...state, ui: { ...state.ui, syncStatus: action.payload } };
    case 'SET_NOTIFICATION':
      return { ...state, ui: { ...state.ui, notification: action.payload } };
    case 'SET_LOADING':
      return { ...state, ui: { ...state.ui, isLoading: action.payload } };
    case 'SET_INITIALIZED':
      return { ...state, ui: { ...state.ui, isInitialized: action.payload } };
    case 'SET_EDITING_ESTIMATE':
      return { ...state, ui: { ...state.ui, editingEstimateId: action.payload } };
    case 'SET_VIEWING_CUSTOMER':
      return { ...state, ui: { ...state.ui, viewingCustomerId: action.payload } };
    case 'UPDATE_SAVED_ESTIMATE':
      return {
        ...state,
        appData: {
          ...state.appData,
          savedEstimates: state.appData.savedEstimates.map(e =>
            e.id === action.payload.id ? action.payload : e
          )
        }
      };
    case 'RFE_HEARTBEAT_UPDATE':
      // Merge Job Updates
      let updatedEstimates = [...state.appData.savedEstimates];
      if (action.payload.jobs && action.payload.jobs.length > 0) {
        const updateMap = new Map(action.payload.jobs.map(j => [j.id, j]));
        updatedEstimates = updatedEstimates.map(e => {
          const update = updateMap.get(e.id);
          return update ? { ...e, ...update } : e;
        });
      }

      // Merge Messages (De-duping)
      let updatedMessages = [...state.appData.messages];
      if (action.payload.messages && action.payload.messages.length > 0) {
        const existingIds = new Set(updatedMessages.map(m => m.id));
        const newMsgs = action.payload.messages.filter(m => !existingIds.has(m.id));
        updatedMessages = [...updatedMessages, ...newMsgs];
      }

      return {
        ...state,
        appData: {
          ...state.appData,
          savedEstimates: updatedEstimates,
          messages: updatedMessages
        },
        ui: { ...state.ui, lastHeartbeat: new Date().toISOString() }
      };
    case 'RESET_CALCULATOR':
      return {
        ...state,
        ui: { ...state.ui, editingEstimateId: null },
        appData: {
          ...state.appData,
          mode: CalculationMode.BUILDING,
          customerProfile: { ...DEFAULT_STATE.customerProfile },
          length: 40, width: 30, wallHeight: 10,
          roofPitch: '4/12',
          isMetalSurface: false,
          wallSettings: { ...DEFAULT_STATE.wallSettings },
          roofSettings: { ...DEFAULT_STATE.roofSettings },
          inventory: [], jobEquipment: [], jobNotes: '', scheduledDate: '', invoiceDate: '',
          invoiceNumber: '', paymentTerms: 'Due on Receipt',
          pricingMode: 'level_pricing', sqFtRates: { wall: 0, roof: 0 },
          // Keep lifetime stats from current state, don't reset
          lifetimeUsage: state.appData.lifetimeUsage,
          messages: state.appData.messages // Keep messages? Or clear? Probably keep
        }
      };
    case 'LOGOUT':
      return { ...initialState, ui: { ...initialState.ui, isLoading: false } };
    default:
      return state;
  }
};

// --- CONTEXT ---
const CalculatorContext = createContext<{
  state: ContextState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

import { heartbeat } from '../services/api'; // Import API

export const CalculatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);

  // HEARTBEAT POLLER
  const [lastPoll, setLastPoll] = React.useState<number>(0);

  React.useEffect(() => {
    if (!state.session || !state.session.spreadsheetId || !state.ui.isInitialized) return;

    const interval = setInterval(async () => {
      try {
        // Only poll if we are not actively syncing (doing heavy lift)
        if (state.ui.syncStatus === 'syncing') return;

        const now = Date.now();
        if (now - lastPoll < 4000) return; // Minimum 4s gap
        setLastPoll(now);

        // Fetch updates since last successful heartbeat
        const lastTime = state.ui.lastHeartbeat || new Date(now - 60000).toISOString(); // Default to 1m ago if fresh
        const result = await heartbeat(state.session.spreadsheetId, lastTime);

        if (result && result.status === 'success' && result.data) {
          const { jobUpdates, messages } = result.data;

          let hasRealUpdates = false;

          // Check for actual changes in messages
          if (messages && messages.length > 0) {
            const existingIds = new Set(state.appData.messages.map(m => m.id));
            if (messages.some(m => !existingIds.has(m.id))) {
              hasRealUpdates = true;
            }
          }

          // Check for actual changes in jobs (compare Last Modified or deep equality if needed)
          // We iterate updates and compare against current state to see if anything actually changed.
          if (!hasRealUpdates && jobUpdates && jobUpdates.length > 0) {
            const currentJobs = new Map(state.appData.savedEstimates.map(j => [j.id, j]));
            for (const update of jobUpdates) {
              const current = currentJobs.get(update.id);
              if (!current) {
                hasRealUpdates = true; // New job
                break;
              }
              // Simple JSON Stringify comparison for 'In Progress' spam prevention
              // We remove fields that might be volatile if necessary, but full object compare is safest
              // to ensure we catch field updates.
              if (JSON.stringify(current) !== JSON.stringify(update)) {
                hasRealUpdates = true;
                break;
              }
            }
          }

          if (hasRealUpdates) {
            dispatch({ type: 'RFE_HEARTBEAT_UPDATE', payload: { jobs: jobUpdates, messages } });
          } else {
            // Just update the timestamp silently without full re-render?
            // Actually, we can dispatch a lightweight timestamp update if we want to acknowledge sync
            // But for now, just skipping the dispatch prevents the re-render loop.
            // We do need to update 'lastHeartbeat' REF effectively so we don't ask for the same data 5s later?
            // NO. The server uses 'lastSync' we sent.
            // If we sent T1 and got Data D1.
            // If we don't update state, T1 remains in state.
            // Next poll, we send T1 again. Server returns D1 again.
            // We compare D1 == Current. "No change". Loop continues.
            // This is fine! It prevents re-renders. It costs bandwidth but saves UI glitches.
            // Ideally we update the watermark silently, but Context doesn't support silent updates.
          }
        }
      } catch (e) {
        console.error("Heartbeat failed", e);
      }
    }, 5000); // 5s Loop

    return () => clearInterval(interval);
  }, [state.session, state.ui.isInitialized, state.ui.syncStatus, state.ui.lastHeartbeat]);

  return (
    <CalculatorContext.Provider value={{ state, dispatch }}>
      {children}
    </CalculatorContext.Provider>
  );
};

export const useCalculator = () => {
  const context = useContext(CalculatorContext);
  if (!context) {
    throw new Error('useCalculator must be used within a CalculatorProvider');
  }
  return context;
};

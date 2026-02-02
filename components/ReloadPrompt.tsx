import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="Container">
      { (offlineReady || needRefresh) && (
        <div className="fixed bottom-4 right-4 p-4 border rounded z-50 bg-white shadow-xl text-slate-900 border-slate-200 animate-in fade-in slide-in-from-bottom-5">
          <div className="mb-2 font-medium">
            { offlineReady
              ? <span>App ready to work offline</span>
              : <span>New content available, click on reload button to update.</span>
            }
          </div>
          <div className="flex gap-2 mt-2">
            { needRefresh && (
              <button className="px-3 py-1 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition" onClick={() => updateServiceWorker(true)}>
                Reload
              </button>
            ) }
            <button className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm font-medium hover:bg-slate-200 transition" onClick={() => close()}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReloadPrompt;

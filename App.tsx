
import React from 'react';
import SprayFoamCalculator from './components/SprayFoamCalculator';
import { CalculatorProvider } from './context/CalculatorContext';
import ReloadPrompt from './components/ReloadPrompt';

function App() {
  return (
    <CalculatorProvider>
      <SprayFoamCalculator />
      <ReloadPrompt />
    </CalculatorProvider>
  );
}

export default App;

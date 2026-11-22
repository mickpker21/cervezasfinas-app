import React from 'react';
import { Check } from 'lucide-react';

export default function CheckoutStepper({ currentStep, steps }) {
    return (
        <div className="w-full py-6">
            <div className="flex items-center justify-between max-w-4xl mx-auto px-4">
                {steps.map((step, index) => {
                    const stepNumber = index + 1;
                    const isActive = stepNumber === currentStep;
                    const isCompleted = stepNumber < currentStep;
                    const isLast = index === steps.length - 1;

                    return (
                        <React.Fragment key={stepNumber}>
                            {/* Step Circle */}
                            <div className="flex flex-col items-center relative">
                                <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 ${isCompleted
                                            ? 'bg-green-600 text-white'
                                            : isActive
                                                ? 'bg-green-600 text-white ring-4 ring-green-200'
                                                : 'bg-gray-200 text-gray-500'
                                        }`}
                                >
                                    {isCompleted ? (
                                        <Check className="w-6 h-6" />
                                    ) : (
                                        stepNumber
                                    )}
                                </div>
                                <span
                                    className={`mt-2 text-sm font-semibold text-center whitespace-nowrap ${isActive ? 'text-green-700' : 'text-gray-600'
                                        }`}
                                >
                                    {step.label}
                                </span>
                            </div>

                            {/* Connector Line */}
                            {!isLast && (
                                <div
                                    className={`flex-1 h-1 mx-2 transition-all duration-300 ${stepNumber < currentStep
                                            ? 'bg-green-600'
                                            : 'bg-gray-200'
                                        }`}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

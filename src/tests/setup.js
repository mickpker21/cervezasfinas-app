import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock global objects if needed (e.g. localStorage, fetch)
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (function () {
    let store = {};
    return {
        getItem: function (key) {
            return store[key] || null;
        },
        setItem: function (key, value) {
            store[key] = value.toString();
        },
        clear: function () {
            store = {};
        },
        removeItem: function (key) {
            delete store[key];
        }
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

// Mock console.error to avoid polluting test output with expected errors
// console.error = vi.fn();

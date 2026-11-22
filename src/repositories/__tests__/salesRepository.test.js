import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSalesBySku } from '../salesRepository';
import * as network from '@/lib/network';
import * as localDb from '@/lib/localDb';
import * as api from '@/lib/mysqlVentasPorSku';

// Mocks
vi.mock('@/lib/network');
vi.mock('@/lib/localDb');
vi.mock('@/lib/mysqlVentasPorSku');

describe('salesRepository', () => {
    const mockDb = {
        query: vi.fn(),
        run: vi.fn(),
        _storage: { get: vi.fn(), set: vi.fn() }
    };

    beforeEach(() => {
        vi.resetAllMocks();
        localDb.getDb.mockResolvedValue(mockDb);
        localDb.isMockDb.mockReturnValue(false);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getSalesBySku', () => {
        it('should fetch from API when online', async () => {
            network.isOnline.mockResolvedValue(true);
            const mockData = [{ id: '1', cve_cliente: 'C1', htls_total: 10 }];
            api.fetchVentasPorSku.mockResolvedValue(mockData);

            const result = await getSalesBySku({ from: '2023-01-01' });

            expect(network.isOnline).toHaveBeenCalled();
            expect(api.fetchVentasPorSku).toHaveBeenCalledWith({ from: '2023-01-01' });
            expect(result).toEqual(mockData);

            // Verify background save (might need a small delay or await if it wasn't awaited in implementation)
            // Since saveSalesToLocal is not awaited in the return, we might not catch it immediately here
            // unless we wait a tick.
            await new Promise(process.nextTick);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should fetch from local DB when offline', async () => {
            network.isOnline.mockResolvedValue(false);
            const mockRows = [{
                cve_cliente: 'C1',
                htls_total: 10,
                fecha: '2023-01-01',
                zona: 'Z1',
                ruta: 'R1'
            }];
            mockDb.query.mockResolvedValue({ values: mockRows });

            const result = await getSalesBySku({ from: '2023-01-01' });

            expect(api.fetchVentasPorSku).not.toHaveBeenCalled();
            expect(mockDb.query).toHaveBeenCalled();
            // Verify normalization
            expect(result[0]).toHaveProperty('period_date', '2023-01-01');
            expect(result[0]).toHaveProperty('sales_route', 'R1');
        });

        it('should fallback to local DB when API fails', async () => {
            network.isOnline.mockResolvedValue(true);
            api.fetchVentasPorSku.mockRejectedValue(new Error('API Error'));

            const mockRows = [{ cve_cliente: 'C1', fecha: '2023-01-01' }];
            mockDb.query.mockResolvedValue({ values: mockRows });

            const result = await getSalesBySku({ from: '2023-01-01' });

            expect(api.fetchVentasPorSku).toHaveBeenCalled();
            expect(mockDb.query).toHaveBeenCalled(); // Fallback triggered
            expect(result).toHaveLength(1);
        });

        it('should filter by route correctly in SQL', async () => {
            network.isOnline.mockResolvedValue(false);
            mockDb.query.mockResolvedValue({ values: [] });

            await getSalesBySku({ from: '2023-01-01', salesRoute: '101' });

            const queryCall = mockDb.query.mock.calls[0];
            const sql = queryCall[0];
            const params = queryCall[1];

            expect(sql).toContain('AND (ruta = ? OR ruta LIKE ?');
            expect(params).toContain('101');
        });
    });
});

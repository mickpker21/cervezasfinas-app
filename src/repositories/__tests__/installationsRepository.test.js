import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInstallerProfile, getInstallationOrders } from '../installationsRepository';
import * as network from '@/lib/network';
import * as localDb from '@/lib/localDb';
import { supabase } from '@/supabaseClient';

// Mocks
vi.mock('@/lib/network');
vi.mock('@/lib/localDb');
vi.mock('@/supabaseClient', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(),
                    in: vi.fn(() => ({
                        order: vi.fn()
                    }))
                }))
            }))
        }))
    }
}));

describe('installationsRepository', () => {
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

    describe('getInstallerProfile', () => {
        it('should fetch from Supabase when online', async () => {
            network.isOnline.mockResolvedValue(true);
            const mockProfile = { id: 'inst1', profile: { name: 'Juan' } };

            // Mock Supabase chain
            const singleMock = vi.fn().mockResolvedValue({ data: mockProfile, error: null });
            const eqMock = vi.fn().mockReturnValue({ single: singleMock });
            const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
            const fromMock = vi.fn().mockReturnValue({ select: selectMock });
            supabase.from = fromMock;

            const result = await getInstallerProfile('user123');

            expect(network.isOnline).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('installers');
            expect(result).toEqual(mockProfile);

            await new Promise(process.nextTick);
            expect(mockDb.run).toHaveBeenCalled(); // Verify save
        });

        it('should fetch from local DB when offline', async () => {
            network.isOnline.mockResolvedValue(false);
            const mockRow = { id: 'inst1', profile_name: 'Juan' };
            mockDb.query.mockResolvedValue({ values: [mockRow] });

            const result = await getInstallerProfile('user123');

            expect(supabase.from).not.toHaveBeenCalled();
            expect(mockDb.query).toHaveBeenCalled();
            expect(result).toEqual({ id: 'inst1', profile: { name: 'Juan' } });
        });
    });

    describe('getInstallationOrders', () => {
        it('should fetch from Supabase when online', async () => {
            network.isOnline.mockResolvedValue(true);
            const mockOrders = [{
                id: 1,
                origin_client: { name: 'C1' },
                destination_client: { name: 'C2' }
            }];

            // Mock Supabase chain
            const orderMock = vi.fn().mockResolvedValue({ data: mockOrders, error: null });
            const inMock = vi.fn().mockReturnValue({ order: orderMock });
            const eqMock = vi.fn().mockReturnValue({ in: inMock });
            const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
            supabase.from = vi.fn().mockReturnValue({ select: selectMock });

            const result = await getInstallationOrders('inst1');

            expect(result).toEqual(mockOrders);
            await new Promise(process.nextTick);
            expect(mockDb.run).toHaveBeenCalled(); // Verify save
        });

        it('should fetch from local DB when offline and parse JSON', async () => {
            network.isOnline.mockResolvedValue(false);
            const mockRows = [{
                id: 1,
                origin_client: '{"name":"C1"}',
                destination_client: '{"name":"C2"}'
            }];
            mockDb.query.mockResolvedValue({ values: mockRows });

            const result = await getInstallationOrders('inst1');

            expect(mockDb.query).toHaveBeenCalled();
            expect(result[0].origin_client).toEqual({ name: 'C1' });
            expect(result[0].destination_client).toEqual({ name: 'C2' });
        });
    });
});

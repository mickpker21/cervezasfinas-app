import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function DashboardSkeleton() {
    return (
        <div className="p-4 space-y-6 animate-pulse">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64 bg-gray-700" />
                    <Skeleton className="h-4 w-48 bg-gray-800" />
                </div>
                <Skeleton className="h-10 w-32 bg-gray-700" />
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="bg-gray-900 border-gray-800">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-24 bg-gray-700" />
                            <Skeleton className="h-4 w-4 rounded-full bg-gray-700" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16 mb-2 bg-gray-700" />
                            <Skeleton className="h-3 w-32 bg-gray-800" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Content Area (Chart/Table) */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 bg-gray-900 border-gray-800">
                    <CardHeader>
                        <Skeleton className="h-6 w-48 bg-gray-700" />
                    </CardHeader>
                    <CardContent className="pl-2">
                        <Skeleton className="h-[350px] w-full bg-gray-800 rounded-lg" />
                    </CardContent>
                </Card>
                <Card className="col-span-3 bg-gray-900 border-gray-800">
                    <CardHeader>
                        <Skeleton className="h-6 w-48 bg-gray-700" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex items-center">
                                    <Skeleton className="h-9 w-9 rounded-full bg-gray-800" />
                                    <div className="ml-4 space-y-1">
                                        <Skeleton className="h-4 w-32 bg-gray-700" />
                                        <Skeleton className="h-3 w-24 bg-gray-800" />
                                    </div>
                                    <Skeleton className="ml-auto h-4 w-16 bg-gray-700" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

import {
	Toast,
	ToastClose,
	ToastDescription,
	ToastProvider,
	ToastTitle,
	ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import React from 'react';
import { createPortal } from 'react-dom';

export function Toaster() {
	const { toasts } = useToast();

	const fsEl = (typeof document !== 'undefined')
		? (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null)
		: null;

	const content = (
		<ToastProvider>
			{toasts.map(({ id, title, description, action, dismiss, update, ...props }) => {
				// Filter out non-DOM props (dismiss/update) to avoid React warnings
				return (
					<Toast key={id} {...props}>
						<div className="grid gap-1">
							{title && <ToastTitle>{title}</ToastTitle>}
							{description && (
								<ToastDescription>{description}</ToastDescription>
							)}
						</div>
						{action}
						<ToastClose />
					</Toast>
				);
			})}
			<ToastViewport />
		</ToastProvider>
	);

	if (fsEl) {
		try {
			return createPortal(content, fsEl);
		} catch (err) {
			// fallback to normal render if portal to fullscreen fails
			return content;
		}
	}

	return content;
}
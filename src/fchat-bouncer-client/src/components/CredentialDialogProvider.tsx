'use client';

import { useState, useEffect } from 'react';
import FChatCredentialDialog from './FChatCredentialDialog';

interface CredentialRequest {
  requestId: string;
  characterName: string;
  message: string;
  expiresAt: string;
  lastLoginFailed: boolean;
  onSubmit: (credentials: { username: string; password: string }) => void;
  onCancel: () => void;
}

export default function CredentialDialogProvider({ children }: { children: React.ReactNode }) {
  const [credentialRequest, setCredentialRequest] = useState<CredentialRequest | null>(null);

  useEffect(() => {
    const handleShowCredentialDialog = (event: CustomEvent) => {
      const { requestId, characterName, message, expiresAt, lastLoginFailed, onSubmit, onCancel } = event.detail;
      
      setCredentialRequest({
        requestId,
        characterName,
        message,
        expiresAt,
        lastLoginFailed: lastLoginFailed ?? false,
        onSubmit: (credentials) => {
          onSubmit(credentials);
          setCredentialRequest(null);
        },
        onCancel: () => {
          onCancel();
          setCredentialRequest(null);
        }
      });
    };

    const handleHideCredentialDialog = () => {
      setCredentialRequest(null);
    };

    // Listen for credential dialog events
    window.addEventListener('showCredentialDialog', handleShowCredentialDialog as EventListener);
    window.addEventListener('hideCredentialDialog', handleHideCredentialDialog);

    return () => {
      window.removeEventListener('showCredentialDialog', handleShowCredentialDialog as EventListener);
      window.removeEventListener('hideCredentialDialog', handleHideCredentialDialog);
    };
  }, []);

  return (
    <>
      {children}
      <FChatCredentialDialog
        isOpen={!!credentialRequest}
        requestId={credentialRequest?.requestId || ''}
        characterName={credentialRequest?.characterName || ''}
        message={credentialRequest?.message || ''}
        expiresAt={credentialRequest?.expiresAt || ''}
        lastLoginFailed={credentialRequest?.lastLoginFailed ?? false}
        onSubmit={credentialRequest?.onSubmit || (() => {})}
        onCancel={credentialRequest?.onCancel || (() => {})}
      />
    </>
  );
}

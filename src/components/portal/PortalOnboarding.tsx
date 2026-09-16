import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ManualOscIngest } from '../ManualOscIngest';
import { useActiveOsc } from '../../contexts/portal/ActiveOscContext';

export const PortalOnboarding: React.FC = () => {
  const { setActiveOscId } = useActiveOsc();
  const navigate = useNavigate();

  const handleSuccess = (oscId: string) => {
    setActiveOscId(oscId);
    navigate('/portal/discover');
  };

  return <ManualOscIngest onSuccess={handleSuccess} />;
};

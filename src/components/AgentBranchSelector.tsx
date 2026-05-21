import { useGitPanel } from "@/hooks/useGitPanel";
import { BranchSwitcher } from "@/components/BranchSwitcher";

interface AgentBranchSelectorProps {
  appId: number;
}

export function AgentBranchSelector({ appId }: AgentBranchSelectorProps) {
  const {
    currentBranch,
    branches,
    remoteBranches,
    switchBranch,
    isSwitchingBranch,
  } = useGitPanel(appId);

  return (
    <BranchSwitcher
      appId={appId}
      currentBranch={currentBranch}
      branches={branches}
      remoteBranches={remoteBranches}
      switchBranch={switchBranch}
      isSwitchingBranch={isSwitchingBranch}
      align="end"
    />
  );
}

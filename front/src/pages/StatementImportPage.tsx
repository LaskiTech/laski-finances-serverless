import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
  Field,
} from '@chakra-ui/react';
import {
  confirmStatementImport,
  initStatementUpload,
  reviewStatement,
  uploadStatementFile,
  type BankId,
  type DocumentType,
  type StatementDetail,
} from '../api/statements';
import { ReviewTable } from '../components/statements/ReviewTable';
import { ReconciliationBanner } from '../components/statements/ReconciliationBanner';

import { formatCurrency } from '../utils/format';

type Step = 'form' | 'uploading' | 'processing' | 'review' | 'done' | 'error';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 60000;

export function StatementImportPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('form');
  const [bank, setBank] = useState<BankId>('ITAU');
  const [documentType, setDocumentType] = useState<DocumentType>('BANK_ACCOUNT');
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [acceptedCandidateIds, setAcceptedCandidateIds] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
  }, []);

  const resetPolling = (): void => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleUpload = async (): Promise<void> => {
    if (!file) {
      setErrorMessage('Selecione um arquivo');
      return;
    }
    const contentType = file.type === 'text/csv' ? 'text/csv' : 'application/pdf';
    setErrorMessage(null);
    setStep('uploading');
    try {
      const init = await initStatementUpload({
        filename: file.name,
        contentType,
        documentType,
        bank,
      });
      await uploadStatementFile(init.uploadUrl, file, contentType);
      setStatementId(init.statementId);
      setStep('processing');
      await pollUntilDone(init.statementId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const pollUntilDone = async (sid: string): Promise<void> => {
    const start = Date.now();
    const tick = async (): Promise<void> => {
      try {
        const latest = await reviewStatement(sid);
        if (latest.status === 'done') {
          const drafts = latest.extractedTransactions ?? [];
          const dupIndices = new Set((latest.duplicates ?? []).map((d) => d.index));
          const initial = new Set<number>();
          drafts.forEach((_d, i) => {
            if (!dupIndices.has(i)) initial.add(i);
          });
          setSelected(initial);
          const highs = (latest.reconciliationCandidates ?? []).filter(
            (c) => c.confidence === 'high',
          );
          setAcceptedCandidateIds(new Set(highs.map((c) => c.candidateId)));
          setDetail(latest);
          setStep('review');
          return;
        }
        if (latest.status === 'failed') {
          setErrorMessage((latest.errors ?? ['Falha no processamento'])[0]);
          setDetail(latest);
          setStep('error');
          return;
        }
        if (Date.now() - start > POLL_MAX_MS) {
          setErrorMessage('Tempo esgotado aguardando processamento');
          setStep('error');
          return;
        }
        pollRef.current = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStep('error');
      }
    };
    await tick();
  };

  const toggleIndex = (i: number): void => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const toggleCandidate = (id: string): void => {
    const next = new Set(acceptedCandidateIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcceptedCandidateIds(next);
  };

  const handleConfirm = async (): Promise<void> => {
    if (!statementId) return;
    if (selected.size === 0) {
      setErrorMessage('Selecione pelo menos uma transação');
      return;
    }
    setSubmitting(true);
    try {
      const result = await confirmStatementImport(statementId, {
        selectedIndices: [...selected].sort((a, b) => a - b),
        acceptedReconciliationIds: [...acceptedCandidateIds],
        reconciliationChoices: Object.keys(choices).length ? choices : undefined,
      });
      setSubmitting(false);
      navigate('/transactions', {
        state: {
          importResult: {
            imported: result.imported,
            skipped: result.skipped.length,
            linked: result.linked,
            linkFailed: result.linkFailed.length,
          },
        },
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const drafts = detail?.extractedTransactions ?? [];
  const candidates = detail?.reconciliationCandidates ?? [];
  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const i of selected) {
      const d = drafts[i];
      if (!d) continue;
      total += d.type === 'EXP' ? d.amount : -d.amount;
    }
    return total;
  }, [selected, drafts]);

  return (
    <Box maxW="1100px" mx="auto" p={{ base: 4, md: 6 }}>
      <Heading size="lg" mb={4}>
        Importar extrato
      </Heading>

      {errorMessage && (
        <Box
          bg="red.50"
          border="1px solid"
          borderColor="red.200"
          p={3}
          mb={4}
          borderRadius="md"
        >
          <Text color="red.700">{errorMessage}</Text>
        </Box>
      )}

      {step === 'form' && (
        <Box bg="white" p={6} borderRadius="md" borderWidth="1px">
          <Field.Root mb={4}>
            <Field.Label>Banco</Field.Label>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value as BankId)}
              style={{ padding: 8, borderRadius: 4, width: '100%' }}
            >
              <option value="ITAU">Itaú</option>
            </select>
          </Field.Root>
          <Field.Root mb={4}>
            <Field.Label>Tipo de documento</Field.Label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              style={{ padding: 8, borderRadius: 4, width: '100%' }}
            >
              <option value="BANK_ACCOUNT">Conta corrente</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
            </select>
          </Field.Root>
          <Field.Root mb={4}>
            <Field.Label>Arquivo (PDF ou CSV, até 10 MB)</Field.Label>
            <Input
              type="file"
              accept="application/pdf,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field.Root>
          <Flex gap={2}>
            <Button onClick={() => void handleUpload()} colorPalette="teal">
              Enviar extrato
            </Button>
            <Button variant="outline" onClick={() => navigate('/transactions')}>
              Cancelar
            </Button>
          </Flex>
        </Box>
      )}

      {(step === 'uploading' || step === 'processing') && (
        <Flex direction="column" align="center" p={10} gap={4}>
          <Spinner size="xl" />
          <Text>
            {step === 'uploading' ? 'Enviando arquivo...' : 'Processando extrato...'}
          </Text>
        </Flex>
      )}

      {step === 'review' && detail && (
        <Box>
          {candidates.length > 0 && (
            <Box mb={4}>
              {candidates.map((candidate) => (
                <ReconciliationBanner
                  key={candidate.candidateId}
                  candidate={candidate}
                  accepted={acceptedCandidateIds.has(candidate.candidateId)}
                  onToggle={() => toggleCandidate(candidate.candidateId)}
                  chosenParent={choices[candidate.candidateId]}
                  onChoose={(sk) =>
                    setChoices((prev) => ({ ...prev, [candidate.candidateId]: sk }))
                  }
                />
              ))}
            </Box>
          )}

          <Flex mb={4} justify="space-between" align="center">
            <Text fontWeight="bold">
              {selected.size} de {drafts.length} transações selecionadas — {formatCurrency(selectedTotal)}
            </Text>
            <Button
              colorPalette="teal"
              onClick={() => void handleConfirm()}
              loading={submitting}
            >
              Confirmar importação
            </Button>
          </Flex>

          <ReviewTable
            drafts={drafts}
            futureInstallments={detail.futureInstallments}
            selected={selected}
            duplicateIndices={new Set((detail.duplicates ?? []).map((d) => d.index))}
            onToggle={toggleIndex}
          />
        </Box>
      )}

      {step === 'error' && (
        <Flex gap={2} mt={4}>
          <Button onClick={() => setStep('form')} colorPalette="teal">
            Tentar novamente
          </Button>
          <Button variant="outline" onClick={() => navigate('/transactions')}>
            Voltar
          </Button>
        </Flex>
      )}
    </Box>
  );
}


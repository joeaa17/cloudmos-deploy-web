import { useEffect, useState } from "react";
import {
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Tabs,
  Tab,
  AppBar,
  Typography,
  Badge,
  List,
  ButtonGroup,
  Link,
  CircularProgress,
  Tooltip,
  InputAdornment
} from "@material-ui/core";
import { a11yProps } from "../../shared/utils/a11yUtils";
import { TabPanel } from "../../shared/components/TabPanel";
import { customRegistry, createCustomFee, gasPrices } from "../../shared/utils/blockchainUtils";
import { SigningStargateClient, calculateFee } from "@cosmjs/stargate";
import { useWallet } from "../WalletProvider";
import clsx from "clsx";
import { TransactionMessage } from "./TransactionMessage";
import { aktToUakt, uaktToAKT } from "../../shared/utils/priceUtils";
import { useSnackbar } from "notistack";
import { useStyles } from "./TransactionModal.styles";
import { useSettings } from "../SettingsProvider";
import { Snackbar } from "../../shared/components/Snackbar";
import { analytics } from "../../shared/utils/analyticsUtils";
import { transactionLink } from "../../shared/constants";
import { BroadcastingError } from "../../shared/utils/errors";
import OpenInNew from "@material-ui/icons/OpenInNew";
import HelpIcon from "@material-ui/icons/Help";
import WarningIcon from "@material-ui/icons/Warning";
import { PriceValue } from "../../shared/components/PriceValue";
import { selectedNetworkId } from "../../shared/deploymentData";

const a11yPrefix = "transaction-tab";
const gasPaddingMultiplier = 1.5;

export function TransactionModal({ isOpen, onConfirmTransaction, messages, onClose }) {
  const [isSendingTransaction, setIsSendingTransaction] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [memo, setMemo] = useState("");
  const [showMemoWarning, setShowMemoWarning] = useState(false);
  const [customGas, setCustomGas] = useState(null); // Set once we calculate fees
  const [customFee, setCustomFee] = useState(null); // Set once we calculate fees
  const [isSettingCustomFee, setIsCustomFee] = useState(false);
  const [isCalculatingFees, setIsCalculatingFees] = useState(true);
  const [calculatedFees, setCalculatedFees] = useState(null);
  const [currentFee, setCurrentFee] = useState("average");
  const { settings } = useSettings();
  const { address, selectedWallet, refreshBalance } = useWallet();
  const classes = useStyles();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const isCustomFeeValid = customFee && parseFloat(customFee) > 0;
  const isGasValid = customGas && parseInt(customGas) > 0;

  useEffect(() => {
    (async () => {
      try {
        const client = await SigningStargateClient.connectWithSigner(settings.rpcEndpoint, selectedWallet, {
          registry: customRegistry,
          broadcastTimeoutMs: 300_000 // 5min
        });

        const gasEstimation = await client.simulate(
          address,
          messages.map((m) => m.message),
          memo
        );
        const estimatedGas = Math.round(gasEstimation * gasPaddingMultiplier);

        const fees = {
          low: calculateFee(estimatedGas, gasPrices.low),
          average: calculateFee(estimatedGas, gasPrices.average),
          high: calculateFee(estimatedGas, gasPrices.high)
        };

        setCalculatedFees(fees);
        setIsCalculatingFees(false);

        setCustomFee(uaktToAKT(fees.average.amount[0].amount));
        setCustomGas(estimatedGas);
      } catch (error) {
        setIsCalculatingFees(false);
        enqueueSnackbar(<Snackbar title="Error" subTitle="An error occured while simulating the tx." iconVariant="error" />, {
          variant: "error",
          autoHideDuration: 10000
        });
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(ev) {
    ev.preventDefault();
    setIsSendingTransaction(true);

    let pendingSnackbarKey = enqueueSnackbar(<Snackbar title="Broadcasting transaction..." subTitle="Please wait a few seconds" showLoading />, {
      variant: "info",
      autoHideDuration: null
    });

    try {
      // Setup client
      const client = await SigningStargateClient.connectWithSigner(settings.rpcEndpoint, selectedWallet, {
        registry: customRegistry,
        broadcastTimeoutMs: 300_000 // 5min
      });

      const fee = isSettingCustomFee ? createCustomFee(aktToUakt(customFee), customGas) : calculatedFees[currentFee];

      const response = await client.signAndBroadcast(
        address,
        messages.map((m) => m.message),
        fee,
        memo
      );
      const transactionHash = response.transactionHash;
      const isError = response.code !== 0;

      console.log(response);

      if (isError) {
        throw new BroadcastingError("Code " + response.code + " : " + response.rawLog, transactionHash);
      }

      showTransactionSnackbar("Transaction succeeds!", "", transactionHash, "success");

      await analytics.event("deploy", "successful transaction");

      refreshBalance();

      // return response message
      onConfirmTransaction(response);
    } catch (err) {
      console.error(err);

      const transactionHash = err.txHash;
      let errorMsg = "An error has occured";

      await analytics.event("deploy", "failed transaction");

      if (err.message.includes("was submitted but was not yet found on the chain")) {
        errorMsg = "Transaction timeout";
      } else {
        try {
          const reg = /Broadcasting transaction failed with code (.+?) \(codespace: (.+?)\)/i;
          const match = err.message.match(reg);
          const log = err.message.substring(err.message.indexOf("Log"), err.message.length);

          if (match) {
            const code = parseInt(match[1]);
            const codeSpace = match[2];

            if (codeSpace === "sdk") {
              const errorMessages = {
                5: "Insufficient funds",
                9: "Unknown address",
                11: "Out of gas",
                12: "Memo too large",
                13: "Insufficient fee",
                19: "Tx already in mempool",
                25: "Invalid gas adjustment"
              };

              if (code in errorMessages) {
                errorMsg = errorMessages[code];
              }
            }
          }

          if (log) {
            errorMsg += `. ${log}`;
          }
        } catch (err) {
          console.error(err);
        }
      }

      showTransactionSnackbar("Transaction has failed...", errorMsg, transactionHash, "error");

      setIsSendingTransaction(false);
    } finally {
      closeSnackbar(pendingSnackbarKey);
    }
  }

  const showTransactionSnackbar = (snackTitle, snackMessage, transactionHash, snackVariant) => {
    enqueueSnackbar(
      <Snackbar
        title={snackTitle}
        subTitle={<TransactionSnackbarContent snackMessage={snackMessage} transactionHash={transactionHash} />}
        iconVariant={snackVariant}
      />,
      {
        variant: snackVariant,
        autoHideDuration: 10000
      }
    );
  };

  const handleTabChange = (event, newValue) => {
    setTabIndex(newValue);
  };

  const onSetGasClick = (event) => {
    event.preventDefault();
    setIsCustomFee(!isSettingCustomFee);
  };

  const onMemoChange = (event) => {
    const newValue = event.target.value;
    setMemo(newValue);

    const splittedValue = (newValue || "").trim().split(" ");
    setShowMemoWarning(splittedValue.length === 12 || splittedValue.length === 24);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={!isSendingTransaction && !isCalculatingFees ? onClose : null}
      maxWidth="xs"
      fullWidth
      aria-labelledby="transaction-modal"
      aria-describedby="transaction modal description"
    >
      <DialogTitle id="transaction-modal">
        <span className={classes.title}>Akash Transaction</span>
      </DialogTitle>
      <DialogContent dividers classes={{ root: classes.tabContent }}>
        <AppBar position="static" color="default">
          <Tabs
            value={tabIndex}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
            aria-label="Akash transaction data"
          >
            <Tab label="Details" {...a11yProps(`${a11yPrefix}-${0}`)} disabled={isCalculatingFees} />
            <Tab label="Data" {...a11yProps(`${a11yPrefix}-${1}`)} disabled={isCalculatingFees} />
          </Tabs>
        </AppBar>

        <TabPanel value={tabIndex} index={0} className={classes.tabPanel}>
          <Badge color="primary" badgeContent={messages.length} classes={{ badge: classes.badge }}>
            <Typography variant="h4" className={classes.label}>
              Messages
            </Typography>
          </Badge>

          <List dense className={classes.messages}>
            {messages.map(({ message }, i) => {
              return <TransactionMessage key={`message_${i}`} message={message} />;
            })}
          </List>

          <Box padding="1rem 0">
            <TextField
              label="Memo"
              disabled={isSendingTransaction}
              value={memo}
              onChange={onMemoChange}
              type="text"
              variant="outlined"
              inputProps={{
                maxLength: 256
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip
                      classes={{ tooltip: classes.tooltip }}
                      arrow
                      title="Memo field is usually used for specifying a customer ID for certain centralized exchanges.
                      Never enter your mnemonic seed phrase / passphrase / password or anything sensitive!
                      Everything in this field becomes permanently public, accessible by anyone!"
                    >
                      {showMemoWarning ? <WarningIcon fontSize="small" color="error" /> : <HelpIcon fontSize="small" color="primary" />}
                    </Tooltip>
                  </InputAdornment>
                )
              }}
              classes={{ root: classes.fullWidth }}
            />
          </Box>

          {isCalculatingFees ? (
            <Box display="flex" alignItems="center" justifyContent="center">
              <CircularProgress size="24px" color="primary" />
            </Box>
          ) : calculatedFees ? (
            <>
              <Box>
                <ButtonGroup
                  size="large"
                  color="primary"
                  aria-label="large outlined primary button group"
                  classes={{ root: classes.fullWidth }}
                  disabled={isSettingCustomFee}
                >
                  <Button
                    disabled={isSendingTransaction}
                    classes={{ root: classes.feeButton, label: classes.feeButtonLabel }}
                    variant={currentFee === "low" ? "contained" : "outlined"}
                    onClick={() => setCurrentFee("low")}
                  >
                    <Box>Low</Box>
                    <Box>
                      <Typography variant="caption">
                        <PriceValue value={uaktToAKT(calculatedFees.low.amount[0].amount, 4)} showLt />
                      </Typography>
                    </Box>
                    <div className={clsx(classes.feeButtonLabelAmount, { [classes.textWhite]: currentFee === "low" })}>
                      {uaktToAKT(calculatedFees.low.amount[0].amount, 4)}AKT
                    </div>
                  </Button>
                  <Button
                    disabled={isSendingTransaction}
                    classes={{ root: classes.feeButton, label: classes.feeButtonLabel }}
                    variant={currentFee === "average" ? "contained" : "outlined"}
                    onClick={() => setCurrentFee("average")}
                  >
                    <Box>Avg</Box>
                    <Box>
                      <Typography variant="caption">
                        <PriceValue value={uaktToAKT(calculatedFees.average.amount[0].amount, 4)} showLt />
                      </Typography>
                    </Box>
                    <div className={clsx(classes.feeButtonLabelAmount, { [classes.textWhite]: currentFee === "average" })}>
                      {uaktToAKT(calculatedFees.average.amount[0].amount, 4)}AKT
                    </div>
                  </Button>
                  <Button
                    disabled={isSendingTransaction}
                    classes={{ root: classes.feeButton, label: classes.feeButtonLabel }}
                    variant={currentFee === "high" ? "contained" : "outlined"}
                    onClick={() => setCurrentFee("high")}
                  >
                    <Box>High</Box>
                    <Box>
                      <Typography variant="caption">
                        <PriceValue value={uaktToAKT(calculatedFees.high.amount[0].amount, 4)} showLt />
                      </Typography>
                    </Box>
                    <div className={clsx(classes.feeButtonLabelAmount, { [classes.textWhite]: currentFee === "high" })}>
                      {uaktToAKT(calculatedFees.high.amount[0].amount, 4)}AKT
                    </div>
                  </Button>
                </ButtonGroup>
              </Box>
              <Box>
                {!isSendingTransaction && (
                  <Typography className={classes.setGasLink}>
                    <Link href="#" onClick={onSetGasClick}>
                      Set custom fee
                    </Link>
                  </Typography>
                )}
                {!isSendingTransaction && isSettingCustomFee && (
                  <>
                    <Box marginBottom=".5rem">
                      <TextField
                        label="Fee (AKT)"
                        value={customFee}
                        onChange={(ev) => setCustomFee(ev.target.value)}
                        type="number"
                        variant="outlined"
                        error={!isCustomFeeValid}
                        inputProps={{
                          step: 0.001,
                          min: 0
                        }}
                        classes={{ root: classes.fullWidth }}
                      />
                    </Box>

                    <Box>
                      <TextField
                        label="Gas"
                        value={customGas}
                        onChange={(ev) => setCustomGas(ev.target.value)}
                        type="number"
                        variant="outlined"
                        error={!isGasValid}
                        inputProps={{
                          step: 1,
                          min: 1
                        }}
                        classes={{ root: classes.fullWidth }}
                      />
                    </Box>
                  </>
                )}
              </Box>
            </>
          ) : null}
        </TabPanel>
        <TabPanel value={tabIndex} index={1} className={clsx(classes.tabPanel)}>
          <Box className={classes.messagesData}>
            {JSON.stringify(
              messages.map((m) => m.message),
              null,
              2
            )}
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose} disabled={isSendingTransaction} type="button" classes={{ root: classes.actionButton }}>
          Reject
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={isSendingTransaction || !isGasValid || isCalculatingFees || !calculatedFees}
          classes={{ root: classes.actionButton }}
        >
          {isSendingTransaction ? <CircularProgress size="24px" color="primary" /> : "Approve"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const TransactionSnackbarContent = ({ snackMessage, transactionHash }) => {
  const classes = useStyles();

  const txUrl = transactionHash && transactionLink(transactionHash, selectedNetworkId);

  return (
    <>
      {snackMessage}
      {snackMessage && <br />}
      {txUrl && (
        <Box component="a" display="flex" alignItems="center" href="#" onClick={() => window.electron.openUrl(txUrl)}>
          View transaction <OpenInNew className={classes.transactionLinkIcon} />
        </Box>
      )}
    </>
  );
};

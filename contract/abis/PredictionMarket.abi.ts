import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const PredictionMarketEvents = [];

export const PredictionMarketAbi = [
    {
        name: 'createMarket',
        inputs: [
            { name: 'question', type: ABIDataTypes.STRING },
            { name: 'description', type: ABIDataTypes.STRING },
            { name: 'resolver', type: ABIDataTypes.ADDRESS },
            { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'resolutionDeadlineDelta', type: ABIDataTypes.UINT256 },
            { name: 'feeBpsOverride', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'stake',
        inputs: [
            { name: 'marketId', type: ABIDataTypes.UINT256 },
            { name: 'side', type: ABIDataTypes.UINT256 },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'resolve',
        inputs: [
            { name: 'marketId', type: ABIDataTypes.UINT256 },
            { name: 'outcome', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancel',
        inputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claim',
        inputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'refund',
        inputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'withdrawFees',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setPlatformResolver',
        inputs: [{ name: 'resolver', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPlatformResolver',
        inputs: [],
        outputs: [{ name: 'resolver', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getResolutionVotes',
        inputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'resolverVote', type: ABIDataTypes.UINT256 },
            { name: 'platformVote', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMarket',
        inputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'question', type: ABIDataTypes.STRING },
            { name: 'description', type: ABIDataTypes.STRING },
            { name: 'resolver', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'resolutionDeadline', type: ABIDataTypes.UINT256 },
            { name: 'yesPool', type: ABIDataTypes.UINT256 },
            { name: 'noPool', type: ABIDataTypes.UINT256 },
            { name: 'outcome', type: ABIDataTypes.UINT256 },
            { name: 'feeBps', type: ABIDataTypes.UINT256 },
            { name: 'creator', type: ABIDataTypes.UINT256 },
            { name: 'createdAt', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPosition',
        inputs: [
            { name: 'marketId', type: ABIDataTypes.UINT256 },
            { name: 'user', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'yesStake', type: ABIDataTypes.UINT256 },
            { name: 'noStake', type: ABIDataTypes.UINT256 },
            { name: 'hasClaimed', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOdds',
        inputs: [{ name: 'marketId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'yesPool', type: ABIDataTypes.UINT256 },
            { name: 'noPool', type: ABIDataTypes.UINT256 },
            { name: 'yesPercent', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMarketCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...PredictionMarketEvents,
    ...OP_NET_ABI,
];

export default PredictionMarketAbi;

import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const TestWBTCEvents = [];

export const TestWBTCAbi = [
    {
        name: 'faucet',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...TestWBTCEvents,
    ...OP_NET_ABI,
];

export default TestWBTCAbi;

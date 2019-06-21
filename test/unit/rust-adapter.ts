'use strict';

import { assert } from 'chai';
import * as Sinon from 'sinon';
import {
    TestLoadStartedEvent,
    TestLoadFinishedEvent,
    TestRunStartedEvent,
    TestRunFinishedEvent,
    TestEvent
} from 'vscode-test-adapter-api';

import { RustAdapter } from '../../src/rust-adapter';
import * as testLoader from '../../src/test-loader';
import * as testRunner from '../../src/test-runner';
import {
    rustAdapterParamStubs,
    rustAdapterParams,
    treeNodes
} from '../test-utils';
import { ITestCaseNode } from '../../src/interfaces/test-case-node';
import { ITestSuiteNode } from '../../src/interfaces/test-suite-node';

suite('RustAdapter Tests:', () => {
    let logInfoStub: Sinon.SinonStub;
    let logErrorStub: Sinon.SinonStub;
    let testsEmitterFireStub: Sinon.SinonStub;
    let testStatesEmitterFireStub: Sinon.SinonStub;
    let loadUnitTestsStub: Sinon.SinonStub;
    let rustAdapter: RustAdapter;
    const workspaceRootDirectoryPath = '/usr/me/rusty-hook';
    const {
        loadedTestsResultStub,
        testCases,
        testSuites,
        structuralNodesLoadedTestsResultStub
    } = treeNodes;

    setup(() => {
        logInfoStub = rustAdapterParamStubs.log.getInfoStub();
        logErrorStub = rustAdapterParamStubs.log.getErrorStub();
        testsEmitterFireStub = Sinon.stub(rustAdapterParams.testsEmitterStub, 'fire');
        testStatesEmitterFireStub = Sinon.stub(rustAdapterParams.testStatesEmitterStub, 'fire');
        const {
            logStub: log,
            testsEmitterStub: testsEmitter,
            testStatesEmitterStub: testStatesEmitter,
            autoRunEmitterStub: autoRunEmitter
        } = rustAdapterParams;
        loadUnitTestsStub = Sinon.stub(testLoader, 'loadUnitTests').withArgs(workspaceRootDirectoryPath, log).callsFake(() => Promise.resolve(loadedTestsResultStub));
        rustAdapter = new RustAdapter(workspaceRootDirectoryPath, log, testsEmitter, testStatesEmitter, autoRunEmitter);
    });

    teardown(() => {
        Sinon.restore();
        rustAdapter = null;
    });

    suite('constructor()', () => {
        test('Should display correct initialization method', async () => {
            assert.isTrue(logInfoStub.firstCall.calledWithExactly('Initializing Rust adapter'));
        });
    });

    suite('load()', () => {
        test('Should gracefully handle exception thrown on load', async () => {
            const err = new Error('crashed');
            loadUnitTestsStub.throws(() => err);
            await rustAdapter.load();
            assert.isTrue(logInfoStub.calledWithExactly('Loading Rust Tests'));
            assert.isTrue(testsEmitterFireStub.calledWithExactly(<TestLoadStartedEvent>{ type: 'started' }));
            assert.isTrue(logErrorStub.calledWithExactly(`Error loading tests: ${err}`));
            assert.isTrue(testsEmitterFireStub.calledWithExactly(<TestLoadFinishedEvent>{ type: 'finished' }));
        });

        test('Should correctly handle no tests found scenario', async () => {
            loadUnitTestsStub.callsFake(() => undefined);
            await rustAdapter.load();
            assert.isTrue(logInfoStub.calledWithExactly('No unit tests found'));
            assert.isTrue(testsEmitterFireStub.calledWithExactly(<TestLoadFinishedEvent>{ type: 'finished' }));
        });

        test('Should correctly handle tests loaded scenario', async () => {
            await rustAdapter.load();
            assert.isTrue(testsEmitterFireStub.calledWithExactly(<TestLoadFinishedEvent>{
                type: 'finished',
                suite: loadedTestsResultStub.rootTestSuite
            }));
        });
    });

    suite('run()', () => {
        let runTestCaseStub: Sinon.SinonStub;
        let runTestSuiteStub: Sinon.SinonStub;
        const testCase1 = testCases.testCase1;
        const testCase1Id = testCase1.id;
        const testCase4 = testCases.testCase4;
        const testCase4Id = testCase4.id;
        const testCase1Result = <TestEvent>{
            test: testCase1Id,
            state: 'passed'
        };
        const testCase2Result = <TestEvent>{
            test: testCases.testCase2.id,
            state: 'passed'
        };
        const testCase3Result = <TestEvent>{
            test: testCases.testCase3.id,
            state: 'passed'
        };
        const testCase4Result = <TestEvent>{
            test: testCase4Id,
            state: 'failed'
        };
        const testCase5Result = <TestEvent>{
            test: testCases.testCase5.id,
            state: 'passed'
        };
        const testSuite3 = testSuites.testSuite3;
        const testSuite5 = testSuites.testSuite5;
        const testSuite3Results = [ testCase2Result, testCase3Result ];
        const testSuite5Results = [ testCase5Result ];

        const setResultForTestCase = (testCase: ITestCaseNode, result: TestEvent) => {
            runTestCaseStub.withArgs(testCase, workspaceRootDirectoryPath).callsFake(() => Promise.resolve(result));
        };

        const setResultsForTestSuite = (testSuite: ITestSuiteNode, results: TestEvent[]) => {
            runTestSuiteStub.withArgs(testSuite, workspaceRootDirectoryPath).callsFake(() => Promise.resolve(results));
        };

        setup(async () => {
            await rustAdapter.load();
            runTestCaseStub = Sinon.stub(testRunner, 'runTestCase');
            runTestCaseStub.callsFake(() => Promise.resolve());
            runTestSuiteStub = Sinon.stub(testRunner, 'runTestSuite');
            runTestSuiteStub.callsFake(() => Promise.resolve([]));
        });

        test('Should correctly handle exception run all', async () => {
            const nodeIds = [ 'root' ];
            const error = new Error('oh nose!');
            runTestCaseStub.throws(error);
            await rustAdapter.run(nodeIds);
            assert.isTrue(logInfoStub.calledWithExactly('Running Rust Tests'));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestRunStartedEvent>{ type: 'started', tests: nodeIds }));
            assert.isTrue(logErrorStub.calledWithExactly(`Run error: ${error}`));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestRunFinishedEvent>{ type: 'finished' }));
        });

        test('Should correctly handle tree-level run all', async () => {
            const nodeIds = [ 'root' ];
            setResultForTestCase(testCase1, testCase1Result);
            setResultForTestCase(testCase4, testCase4Result);
            setResultsForTestSuite(testSuite3, testSuite3Results);
            setResultsForTestSuite(testSuite5, testSuite5Results);
            await rustAdapter.run(nodeIds);
            assert.isTrue(logInfoStub.calledWithExactly('Running Rust Tests'));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestRunStartedEvent>{ type: 'started', tests: nodeIds }));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase1Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase4Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase2Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase3Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase5Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestRunFinishedEvent>{ type: 'finished' }));
            assert.isFalse(logErrorStub.called);
        });

        test('Should correctly handle tree-level run all with structural node', async () => {
            loadUnitTestsStub.callsFake(() => Promise.resolve(structuralNodesLoadedTestsResultStub));
            await rustAdapter.load();
            const nodeIds = [ 'root' ];
            setResultForTestCase(testCase1, testCase1Result);
            setResultForTestCase(testCase4, testCase4Result);
            setResultsForTestSuite(testSuite3, testSuite3Results);
            setResultsForTestSuite(testSuite5, testSuite5Results);
            await rustAdapter.run(nodeIds);
            assert.isTrue(logInfoStub.calledWithExactly('Running Rust Tests'));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestRunStartedEvent>{ type: 'started', tests: nodeIds }));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase1Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase4Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase2Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase3Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestEvent>testCase5Result));
            assert.isTrue(testStatesEmitterFireStub.calledWithExactly(<TestRunFinishedEvent>{ type: 'finished' }));
            assert.isFalse(logErrorStub.called);
        });
    });

    suite('get tests()', () => {
        test('Should have correct value', () => {
            assert.deepEqual(rustAdapter.tests, rustAdapterParams.testsEmitterStub.event);
        });
    });

    suite('get testStates()', () => {
        test('Should have correct value', () => {
            assert.deepEqual(rustAdapter.testStates, rustAdapterParams.testStatesEmitterStub.event);
        });
    });

    suite('get autorun()', () => {
        test('Should have correct value', () => {
            assert.deepEqual(rustAdapter.autorun, rustAdapterParams.autoRunEmitterStub.event);
        });
    });

    suite('debug()', () => {
        test('Should throw not implemented error', async () => {
            try {
                await rustAdapter.debug([]);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.deepEqual(err.message, 'Method not implemented.');
            }
        });
    });

    suite('cancel()', () => {
        test('Should throw not implemented error', () => {
            assert.throws(rustAdapter.cancel, 'Method not implemented.');
        });
    });

    suite('dispose()', () => {
        let rustAdapterCancelStub: Sinon.SinonStub;
        let testsEmitterDisposeStub: Sinon.SinonStub;
        let testStatesEmitterDisposeStub: Sinon.SinonStub;
        let autoRunEmitterDisposeStub: Sinon.SinonStub;

        setup(() => {
            testsEmitterDisposeStub = rustAdapterParamStubs.testsEmitterStubs.getDisposeStub();
            testStatesEmitterDisposeStub = rustAdapterParamStubs.testsStatesEmitterStubs.getDisposeStub();
            autoRunEmitterDisposeStub = rustAdapterParamStubs.autoRunEmitterStubs.getDisposeStub();
            rustAdapterCancelStub = Sinon.stub(rustAdapter, 'cancel');
        });

        test('Should properly dispose all contents', () => {
            rustAdapter.dispose();
            assert.isTrue(rustAdapterCancelStub.called);
            assert.isTrue(testsEmitterDisposeStub.called);
            assert.isTrue(testStatesEmitterDisposeStub.called);
            assert.isTrue(autoRunEmitterDisposeStub.called);
        });
    });
});
